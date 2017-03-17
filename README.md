# Node.js Dummy FTP Server

This is an **FTP Server** made with Node.js for a course project in Distributed Systems.
The code needs some cleaning and revisions.

The server can receive, send, create, list and delete files/directories.
Notice that sending directories may cause (not yet handled) errors.

The server was manually tested with FileZilla client app.


## List of accepted commands

* USER
* PASS
* SYST
* FEAT
* TYPE
* PORT
* STOR
* RETR
* MKD
* RMD
* DELE
* LIST
* PWD
* CWD
* CLOSE
