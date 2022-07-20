try {
    const tabHostname = settings['x-hdy-main-frame-host']

    if(!window.caches) { throw '' }

    utils.redefineFunctionOfObjectProto(
        window.CacheStorage.prototype,
        'open',
        open => {
            return function (name) {
                name += '|' + tabHostname
                return open.bind(this)(name)
            }
        }
    )

    utils.redefineFunctionOfObjectProto(
        window.CacheStorage.prototype,
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

    let old_has = window.CacheStorage.prototype.has
    utils.redefineFunctionOfObjectProto(
        window.CacheStorage.prototype,
        'has',
        has => {
            return function (name) {
                return old_has.bind(this)(name + '|' + tabHostname)
            }
        }
    )

    utils.redefineFunctionOfObjectProto(
        window.CacheStorage.prototype,
        'delete',
        _delete => {
            return function (name) {
                return new Promise((resolve, reject) => {
                    _delete.bind(this)(name + '|' + tabHostname).then(resolve).catch(reject)
                })
            }
        }
    )

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }