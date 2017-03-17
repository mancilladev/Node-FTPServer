var Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs-extra'))
const net = require('net')
const path = require('path')
const spawn = require('child_process').spawn

const PORT = 1337
let curDir = __dirname
let sockets = []
let _data = ''
let _clientAddress = null
let _clientPort = null
//
// speedtest.tele2.net
//

function run_cmd(cmd, args, callBack ) {
    return new Promise(function(resolve, reject) {
        var spawn = require('child_process').spawn
        var child = spawn(cmd, args)
        var resp = ""

        child.stdout.on('data', function (buffer) { resp += buffer.toString() })
        child.stdout.on('end', function() { resolve (resp) })
    })
}

_completePath = (directory = '') => {
    return path.join(curDir, directory)
}

downloadFile = (filename) => {
    return fs.readFileSync(_completePath(filename))
}

downloadMutlipleFiles = (socket, files) => {
    files.forEach(file => downloadFile(socket, file))
}

changeCurDir = (directory) => {
     return new Promise(function(resolve, reject) {
        if (directory.split('/').length == 1) {directory = _completePath(directory)}
        fs.stat(directory, (err, data) => {
            if (err) {
                console.log(err, directory)
                resolve({code: 450, message: 'Error in path\r\n'})
            }
            else if (!data.isDirectory()) {
                resolve({code: 450, message: 'Path is not a directory\r\n'})
            }
            else {
                curDir = directory
                console.log(curDir)
                resolve({code: 212,
                    message: 'Succesfully changed directory\r\n'
                })
            }
        })
    })
}



showDirContents = (dir) => {
    return fs.readdirSync(dir).join('\r\n')
}

_remove = file => {
    fs.removeSync(_completePath(file))
}

deleteEmptyDir = (directory) => {
    return new Promise(function(resolve, reject) {
            fs.readdir(_completePath(directory), (err, files) => {
            if (err) {
                resolve(450)
            }
            if (!files || !files.length) {
                _remove(directory)
                resolve(212)
            }
            else {
                resolve(10066)
            }
        })
    })
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

    socket.receiveFile = function (filename) {
        dataSocket = net.createConnection(_clientPort, _clientAddress)
        socket.reply(150)
        dataSocket.pipe(fs.createWriteStream(_completePath(filename)))
        dataSocket.on('end', () => socket.reply(226))
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
    "STOR": function (target) {
        this.receiveFile(target)
    },
    "RETR": function (target) {
        this.dataTransfer(function () {
            return downloadFile(target || _completePath())
        })
    },
    "MKD": function (dir) {
        fs.mkdirSync(_completePath(dir))
        this.reply(257, dir)
    },
    "RMD": function (target) {
        deleteEmptyDir(target).then(code => this.reply(code))
    },
    "DELE": function (dir) {
        fs.removeSync(_completePath(dir))
        this.reply(213, 'Succesfully deleted file.')
    },
    "LIST": function (target) {
        run_cmd( "ls", ["-l", _completePath()]).then(text => {
            lines = text.split('\n')
            result = lines.slice(1, lines.length).join('\r\n')
            this.dataTransfer(function () {
                return result
            })
        })
    },
    "PWD": function () {
        this.reply(212, '"' + _completePath() + '"')
    },
    "CWD": function (target) {
        changeCurDir(target).then((response) => {
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

