var Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs-extra'))
const net = require('net')
const path = require('path')
const spawn = require('child_process').spawn

const PORT = 1337
let curDir = path.join(__dirname, 'files/')
let sockets = []
let _data = ''
let _clientAddress = null
let _clientPort = null
//
// speedtest.tele2.net
//

_completePath = (directory = '') => {
    return path.join(curDir, directory)
}

fs.readFileAsync = (path) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, (err, data) => {
            if (err) 
                reject(err)
            else 
                resolve(data)
        })
    })
}

downloadMutlipleFiles = (socket, files) => {
    files.forEach(file => downloadFile(socket, file))
}

changeCurDir = (directory) => {
     return new Promise(function(resolve, reject) {
        fs.stat(_completePath(directory), (err, data) => {
            if (err) {
                resolve({code: 450, message: 'Error in path\r\n'})
            }
            else if (!data.isDirectory()) {
                resolve({code: 450, message: 'Path is not a directory\r\n'})
            }
            else {
                curDir = _completePath(directory)
                resolve({code: 212,
                    message: 'Succesfully changed directory\r\n'
                })
            }
        })
    })
}

showDirContents = (dir) => {
    console.log('WTF')
    console.log(fs.readdirSync(dir).map(f => {
        return (f.indexOf('.') === 1) ? dir + '/' : dir
    }).join('\r\n'))
    return fs.readdirSync(dir).map(f => {
        return (f.indexOf('.') === 1) ? dir + '/' : dir
    }).join('\r\n')
}

_remove = file => {
    fs.remove(_completePath(file), err => {
        if (err) return console.error(err)

        socket.write('Succesfully removed: ' + file + '\n')
    })
}

deleteFile = (socket, args) => {
    if (args.length === 1) {
        file = args[0]
    }
    else if (args.length === 2) {
        file = args[1]
    }
    else {
        socket.write('Invalid number of arguments.\n')
        return console.error(err)
    }

    fs.stat(_completePath(file), (err, stats) => {
        if (err) {
            socket.write('Not found!\n')
        }
        else if (!stats.isDirectory() || (stats.isDirectory() && args[0] === '-R')) {
            _remove(file)
        }
        else {
            socket.write('Invalid arguments. \
                Argument -R required to delete a directory\n'
            )
        }
    })
}

deleteEmptyDir = (socket, directory) => {
    fs.readdir(_completePath(directory), (err, files) => {
        if (err) {
            socket.write('Directory not found\n')
        }
        else {
            if (!files.length) {
                _remove(directory)
            }
            else {
                // 10066
            }
        }
    })
}

showCurrentLocation = socket => {
    socket.write(_completePath() + '\n')
}


/**
 * Socket definition
 */
newSocket = socket => {

    socket.setTimeout(0)
    socket.setNoDelay()
    socket.dataEncoding = "binary"
    socket.asciiEncoding = "utf8"
    socket.dataInfo = null
    socket.username = null

    socket.reply = function (status, message, callback) {
        if (!message) message = messages[status.toString()] || 'No information'
        if (this.writable) {
            console.log(status.toString() + ' ' + message.toString())
            this.write(status.toString() + ' ' + message.toString() + '\r\n', callback)
        }
    }

    socket.dataTransfer = function (handle) {
        execute = () => {
            socket.reply(150)
            dataSocket.write(handle())
            dataSocket.end()
            socket.reply(226)
        }
        dataSocket = net.createConnection(_clientPort, _clientAddress)
        dataSocket.on('connect', execute)
    }

    socket.close = function () {
        let i = sockets.indexOf(socket)
        if (i !== -1) {
            sockets.splice(i, 1)
        }
    }

    sockets.push(socket)
    socket.on('data', data => receiveData(socket, data))
    socket.on('end', socket.close)
    socket.reply(220)
}

cleanInput = data => {
    return data.toString().replace(/^\s+|\s+$/g,"")
}

receiveData = (socket, data) => {
    let parts = cleanInput(data.toString()).split(' ')
        , command = cleanInput(parts[0]).toUpperCase()
        , args = parts.slice(1, parts.length)
        , callable = commands[command]
    if (!callable) {
        socket.reply(502)
    } else {
        callable.apply(socket, args)
    }
}


/**
 * Standard messages for status (RFC 959)
 */
messages = exports.messages = { '110': 'Restart marker reply.',
  '120': 'Service ready in %s minutes.',
  '125': 'Data connection already open; transfer starting.',
  '150': 'File status okay; about to open data connection.',
  '200': 'Command okay.',
  '202': 'Command not implemented, superfluous at this site.',
  '211': 'System status, or system help reply.',
  '212': 'Directory status.',
  '213': 'File status.',
  '214': 'Help message.',
  '215': 'NodeFTP server emulator.',
  '220': 'Service ready for new user.',
  '221': 'Service closing control connection.',
  '225': 'Data connection open; no transfer in progress.',
  '226': 'Closing data connection.',
  '227': 'Entering Passive Mode.',
  '230': 'User logged in, proceed.',
  '250': 'Requested file action okay, completed.',
  '257': '"%s" created.',
  '331': 'User name okay, need password.',
  '332': 'Need account for login.',
  '350': 'Requested file action pending further information.',
  '421': 'Service not available, closing control connection.',
  '425': 'Can\'t open data connection.',
  '426': 'Connection closed; transfer aborted.',
  '431': 'No such directory.',
  '450': 'Requested file action not taken.',
  '451': 'Requested action aborted. Local error in processing.',
  '452': 'Requested action not taken.',
  '500': 'Syntax error, command unrecognized.',
  '501': 'Syntax error in parameters or arguments.',
  '502': 'Command not implemented.',
  '503': 'Bad sequence of commands.',
  '504': 'Command not implemented for that parameter.',
  '530': 'Not logged in.',
  '532': 'Need account for storing files.',
  '550': 'Requested action not taken.',
  '551': 'Requested action aborted. Page type unknown.',
  '552': 'Requested file action aborted.',
  '553': 'Requested action not taken.'
}


/**
 * Commands implemented by the FTP server
 */
commands = exports.commands = {
    "USER": function (username) {
        this.username = username
        this.reply(331)
    },
    "PASS": function (password) {
        // Automatically accept password
        this.reply(230)
    },
    "SYST": function () {
        this.reply(215, 'Node FTP featureless server')
    },
    "FEAT": function () {
        this.write('211-Extensions supported\r\n')
        // No feature
        this.reply(211, 'End')
    },
    "TYPE": function (dataEncoding) {
        if (dataEncoding == "A" || dataEncoding == "I") {
            this.dataEncoding = (dataEncoding == "A") ? this.asciiEncoding : "binary"
            this.reply(200)
        } else {
            this.reply(501)
        }
    },
    "PORT": function (info) {
        info = info.split(',').map(x => parseInt(x))
        _clientAddress = info.slice(0,4).join('.')
        _clientPort = info[4]*256 + info[5]
        this.reply(202)
    },
    "LIST": function (target) {
        this.dataTransfer(function () {
            return showDirContents(target || _completePath())
        })
    },
    "RETR": function (target) {
        this.dataTransfer(function () {
            return downloadFile(target || _completePath())
        })
    },
    "PWD": function () {
        this.reply(257, '"' + _completePath() + '"')
    },
    "CWD": function (target) {
        changeCurDir(target).then((response) => {
            console.log('Changed dir: ', curDir)
            this.reply(response.code, response.message)
        })
    },
    "CLOSE": function () {
        this.reply(221)
        this.end()
    }
}

/**
 * Initialize FTP Server
 */
const server = net.createServer(newSocket)
server.on('listening', function () {
  console.log('Server listening on ' + server.address().address + ':' + server.address().port)
})
server.listen(PORT)

