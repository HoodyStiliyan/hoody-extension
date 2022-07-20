try {
    // we're inside of an iframe
    if(window != top && window.location.href.startsWith('about:srcdoc')) {

        function getInternalID(cb) {
            if(window.frameElement.internalID) return cb(window.frameElement.internalID)
            Object.defineProperty(window.frameElement, 'internalID', {
                configurable: true,
                set(v){
                    Object.defineProperty(window.frameElement, 'internalID', {
                        configurable: true, 
                        enumerable: true, 
                        writable: true, 
                        value: v 
                    })
                    cb(v)
                }
            })
        }

        // "internalID" is something that's set inside the content script
        // every iframe has one so it's easy to deal with multiple iframes inside the extension
        getInternalID(internalID => {
            window.parent.postMessage(`payload_loaded_${settings.magicKey}_${internalID}`, '*')
        })

        Object.defineProperty(window.frameElement.contentWindow.document, 'readyState', {
            configurable: true, 
            get: function() {
                return 'complete'
            }
        })
    }

    const contentWindowDescriptor = Object.getOwnPropertyDescriptor(
        window.HTMLIFrameElement.prototype, 'contentWindow'
    )

    Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
        configurable: true,

        get: function () {
            const old = contentWindowDescriptor.get.call(this)
            const is_srcDoc = this.srcdoc !== undefined && this.srcdoc.trim().length > 0 === true

            if(is_srcDoc) {
                utils.redefineFunctionOfObjectProto(
                    old.HTMLElement.prototype, 
                    'getBoundingClientRect', 
                    _getBoundingClientRect => {
                    return function () {
                        const result = _getBoundingClientRect.bind(this)()
        
                        const multipler = 0.00001
        
                        result.x += multipler * settings.random
                        result.y += multipler * settings.random
                        result.width += multipler * settings.random
                        result.height += multipler * settings.random
                        result.top += multipler * settings.random
                        result.right += multipler * settings.random
                        result.left += multipler * settings.random
                        result.bottom += multipler * settings.random
        
                        return result
                    }
                })

                return old
            }

            return old
        }
    })

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }