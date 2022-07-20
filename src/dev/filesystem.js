try {
    const tabHostname = settings['x-hdy-main-frame-host']

    if(!window.requestFileSystem && !window.webkitRequestFileSystem) throw ''

    const requestFuncName = window.webkitRequestFileSystem ? 'webkitRequestFileSystem' : 'requestFileSystem'

    let old_requestFileSystem = window[requestFuncName]
    utils.setPropOfProt(window, requestFuncName, (type, size, successCallback, errorCallback) => {
        const mySuccessCallback = fs => {
            const old_getDirectory = fs.root.getDirectory
            const old_getFile = fs.root.getFile

            const tabHname = `%${tabHostname.replaceAll('.', '@')}%`
            
            function spoofEverySubPath(path) {
                return path.split('/').map(sub => sub + tabHname).join('/')
            }

            function fixEverySubPath(path) {
                return path.split('/').map(sub => sub.split(tabHname).slice(0, -1).join(tabHname)).join('/')
            }

            function myInnerSuccessCallback(successCallback) {
                return function (entry) {

                    utils.setPropOfProt(entry, 'name', fixEverySubPath(entry.name))
                    utils.setPropOfProt(entry, 'fullPath', fixEverySubPath(entry.fullPath))

                    successCallback(entry)
                }
            }

            fs.root.getDirectory = function (path, options, successCallback, errorCallback) {
                return old_getDirectory.bind(this)(
                    spoofEverySubPath(path), 
                    options, 
                    myInnerSuccessCallback(successCallback), 
                    errorCallback
                )
            }
            fs.root.getFile = function (path, options, successCallback, errorCallback) {
                return old_getFile.bind(this)(
                    spoofEverySubPath(path),
                    options, 
                    myInnerSuccessCallback(successCallback), 
                    errorCallback
                )
            }

            return successCallback(fs)
        }
        return old_requestFileSystem(type, size, mySuccessCallback, errorCallback)
    })

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }