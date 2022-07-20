try {
    const tabHostname = settings['x-hdy-main-frame-host']
    
    let old_length_getter = Object.getOwnPropertyDescriptor(window.Storage.prototype, 'length').get

    let old_key = window.Storage.prototype.key
    utils.redefineFunctionOfObjectProto(
        window.Storage.prototype,
        'key',
        key => {
            return function (n) {
                // get all keys for that hostname only
                let keys = []
                for(let i = 0; i < old_length_getter.bind(this)(); i++) {
                    let k = old_key.bind(this)(i)
                    if(k.endsWith('|' + tabHostname)) keys.push(k)
                }

                if(n >= keys.length) return null
                return keys[n].split('|').slice(0, -1).join('|')
            }
        }
    )

    utils.redefineFunctionOfObjectProto(
        window.Storage.prototype,
        'getItem',
        getItem => {
            return function (key) {
                key += '|' + tabHostname
                return getItem.bind(this)(key)
            }
        }
    )

    utils.redefineFunctionOfObjectProto(
        window.Storage.prototype,
        'setItem',
        setItem => {
            return function (key, value) {
                key += '|' + tabHostname
                return setItem.bind(this)(key, value)
            }
        }
    )

    let old_removeItem = window.Storage.prototype.removeItem
    utils.redefineFunctionOfObjectProto(
        window.Storage.prototype,
        'removeItem',
        removeItem => {
            return function (key) {
                key += '|' + tabHostname
                return removeItem.bind(this)(key)
            }
        }
    )

    utils.redefineFunctionOfObjectProto(
        window.Storage.prototype,
        'clear',
        clear => {
            return function (...args) {
                for(let i = 0; i < old_length_getter.bind(this)(); i++) {
                    let k = old_key.bind(this)(i)
                    if(k.endsWith('|' + tabHostname)) old_removeItem.bind(this)(k)
                }
                return
            }
        }
    )

    try {
        utils.setDynamicPropOfProt(window.Storage.prototype, 'length', function() {
            let count = 0
            for(let i = 0; i < old_length_getter.bind(this)(); i++) {
                let k = old_key.bind(this)(i)
                if(k.endsWith('|' + tabHostname)) count++
            }
            return count
        })
    } catch {}

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }