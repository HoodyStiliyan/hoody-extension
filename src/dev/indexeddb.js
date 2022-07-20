try {
    if (!('indexedDB' in window)) throw ''
    const tabHostname = settings['x-hdy-main-frame-host']

    utils.redefineFunctionOfObject(
        window.indexedDB,
        'open',
        open => {
            return function (name, version) {
                name += '|' + tabHostname
                return open(name, version)
            }
        }
    )

    utils.redefineFunctionOfObject(
        window.indexedDB,
        'deleteDatabase',
        deleteDatabase => {
            return function (name) {
                name += '|' + tabHostname
                return deleteDatabase(name)
            }
        }
    )

    utils.redefineFunctionOfObject(
        window.indexedDB,
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
        let old_name_getter = Object.getOwnPropertyDescriptor(window.IDBDatabase.prototype, 'name').get
        utils.setDynamicPropOfProt(window.IDBDatabase.prototype, 'name', function() {
            return (old_name_getter.bind(this)())
                .split('|')
                .filter(x => x.trim().length > 0)
                .slice(0, -1)
                .join('|')
        })
    } catch {}
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }