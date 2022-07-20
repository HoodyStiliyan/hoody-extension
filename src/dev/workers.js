try {
    const tabHostname = settings['x-hdy-main-frame-host']

    // sync way to convert blob url to string
    function blobToString(blobURL) {
        var url, req
        url = blobURL
        req = new XMLHttpRequest()
        req.open('GET', url, false)
        req.send()
        URL.revokeObjectURL(url)
        return req.responseText
    }

    function spoofCache(tabHostname, getUtils) {
        const utils = getUtils()

        utils.redefineFunctionOfObjectProto(
            self.CacheStorage.prototype,
            'open',
            open => {
                return function (name) {
                    name += '|' + tabHostname
                    return open.bind(this)(name)
                }
            }
        )
    
        utils.redefineFunctionOfObjectProto(
            self.CacheStorage.prototype,
            'keys',
            keys => {
                return function () {
                    return new Promise((resolve, reject) => {
                        keys.bind(this)().then(list => {
                            resolve(list.map(name => name.split('|').slice(0, -1).join('|')))
                        }).catch(reject)
                    })
                }
            }
        )
    
        let old_has = self.CacheStorage.prototype.has
        utils.redefineFunctionOfObjectProto(
            self.CacheStorage.prototype,
            'has',
            has => {
                return function (name) {
                    return old_has.bind(this)(name + '|' + tabHostname)
                }
            }
        )
    
        utils.redefineFunctionOfObjectProto(
            self.CacheStorage.prototype,
            'delete',
            _delete => {
                return function (name) {
                    return new Promise((resolve, reject) => {
                        _delete.bind(this)(name + '|' + tabHostname).then(resolve).catch(reject)
                    })
                }
            }
        )
    }

    function spoofIndexedDB(tabHostname, getUtils) {
        const utils = getUtils()

        if (!('indexedDB' in self)) return

        utils.redefineFunctionOfObject(
            self.indexedDB,
            'open',
            open => {
                return function (name, version) {
                    name += '|' + tabHostname
                    return open(name, version)
                }
            }
        )

        utils.redefineFunctionOfObject(
            self.indexedDB,
            'deleteDatabase',
            deleteDatabase => {
                return function (name) {
                    name += '|' + tabHostname
                    return deleteDatabase(name)
                }
            }
        )

        utils.redefineFunctionOfObject(
            self.indexedDB,
            'databases',
            databases => {
                return function () {
                    return new Promise((resolve, reject) => {
                        databases().then(
                            res => resolve(
                                res.filter(
                                    x => x.name
                                        .split('|')
                                        .filter(x => x.trim().length > 0)
                                        .reverse()[0] == tabHostname
                                ).map(x => { return {...x, name: x.name
                                    .split('|')
                                    .filter(x => x.trim().length > 0)
                                    .slice(0, -1)
                                    .join('|')
                                }})
                            )
                        )
                        .catch(err => {
                            // this should never be executed but I'll leave it here just so i can sleep good
                            reject(err)
                        })
                    })
                }
            }
        )
        
        try {
            let old_name_getter = Object.getOwnPropertyDescriptor(self.IDBDatabase.prototype, 'name').get
            utils.setDynamicPropOfProt(self.IDBDatabase.prototype, 'name', function() {
                return (old_name_getter.bind(this)())
                    .split('|')
                    .filter(x => x.trim().length > 0)
                    .slice(0, -1)
                    .join('|')
            })
        } catch {}
    }

    function spoofBroadcastChannel(tabHostname, getUtils){
        const utils = getUtils()
        let old_BroadcastChannel = self.BroadcastChannel

        try {
            let old_name_getter = Object.getOwnPropertyDescriptor(self.BroadcastChannel.prototype, 'name').get
            utils.setDynamicPropOfProt(self.BroadcastChannel.prototype, 'name', function() {
                return (old_name_getter.bind(this)())
                    .split('|')
                    .filter(x => x.trim().length > 0)
                    .slice(0, -1)
                    .join('|')
            })
        } catch {}

        // Intl.BroadcastChannel spoof
        utils.setPropOfProt(self, 'BroadcastChannel', function BroadcastChannel(name) {
            return new old_BroadcastChannel(name + '|' + tabHostname)
        })
    }

    function injectPayloadInBlob(blobURL) {
        const cacheSpoofText = `(${spoofCache})("${tabHostname}", ${'' + getUtils});`
        const indexedDBSpoofText = `(${spoofIndexedDB})("${tabHostname}", ${'' + getUtils});`
        const broadcastChannelText = `(${spoofBroadcastChannel})("${tabHostname}", ${'' + getUtils});`
        const payloadText = `${cacheSpoofText};${indexedDBSpoofText};${broadcastChannelText};${blobToString(blobURL)}`
        const hijackedBlobURL = URL.createObjectURL(new Blob([payloadText]))
        return hijackedBlobURL
    }
    
    // window.Worker spoof
    if(window.Worker) {
        let old_Worker = window.Worker
        utils.setPropOfProt(window, 'Worker', function Worker(url, options) {
            let customUrl = url.startsWith('blob') ? injectPayloadInBlob(url) : url
            return new old_Worker(customUrl, options)
        })
    }

    // window.SharedWorker spoof
    if(window.SharedWorker) {
        let old_SharedWorker = window.SharedWorker
        utils.setPropOfProt(window, 'SharedWorker', function SharedWorker(url, options) {
            let customUrl = url.startsWith('blob') ? injectPayloadInBlob(url) : url
            return new old_SharedWorker(customUrl, options)
        })
    }

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }