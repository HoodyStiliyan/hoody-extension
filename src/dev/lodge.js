try {
    // TODO: this should be a dynamic, moving key, to avoid detection
    const MAGIC_KEY = settings.magicKey
    const tabHostname = settings['x-hdy-main-frame-host']

    let messageProxies = new WeakMap()

    let topOrigin
    try {
        // topOrigin = top.location.origin
        topOrigin = tabHostname
    } catch (e) {}
    let swCanControlPage = window === top || location.origin === topOrigin

    navigator.serviceWorker.addEventListener('message', (evt) => {
        if (evt.data && MAGIC_KEY in evt.data) {
            // console.log('can you control me?', swCanControlPage)
            if (evt.source) {
                // theoretically, this should always work, since
                // we're able to receive the MAGIC_KEY from the service worker
                // and that means this window has a controller
                // console.log('i will let you know if you can control me', swCanControlPage)
                evt.source.postMessage({
                    [MAGIC_KEY]: swCanControlPage
                })
            }
        }
    })

    const addEventListenerHandler = {
        // Make toString() native
        get(target, key) {
            return Reflect.get(target, key)
        },
        apply: function(target, thisArg, args) {
            let event = args[0]
            let listener = args[1]
            let options = args[2]
            let actualListener = listener

            // TODO: test if this can be aborted cleanly by the real script
            if (listener && event === 'message') {
                listener = function (evt) {
                    if (evt.data && MAGIC_KEY in evt.data) {
                        return
                    }

                    return actualListener.apply(this, arguments)
                }

                // TODO: HUGE VULNERABILITY TO DIRTY DETECTION METHODS HERE
                // we have a big problem if the real script tries to pass us
                // an anonymous function, they will try to 
                messageProxies.set(actualListener, listener)
            }

            let newArgs = []

            // this is so we get the exact same errors/behaviors with calling addEventListener
            // the normal way
            if (args.length > 0) {
                newArgs.push(event)
            }

            if (args.length > 1) {
                newArgs.push(listener)
            }

            if (args.length > 2) {
                newArgs.push(options)
            }

            return target.apply(
                thisArg,
                newArgs
            )
        }
    }

    const removeEventListenerHandler = {
        // Make toString() native
        get(target, key) {
            return Reflect.get(target, key)
        },
        apply: function(target, thisArg, args) {
            let event = args[0]
            let listener = args[1]
            let options = args[2]
            let actualListener = listener

            if (listener && event === 'message') {
                listener = messageProxies.get(actualListener)
            }

            let newArgs = []

            // this is so we get the exact same errors/behaviors with calling removeEventListener
            // the normal way
            if (args.length > 0) {
                newArgs.push(event)
            }

            if (args.length > 1) {
                newArgs.push(listener)
            }

            if (args.length > 2) {
                newArgs.push(options)
            }

            let output

            try {
                output = target.apply(
                    thisArg,
                    newArgs
                )
            } catch (e) {
                throw e
            }

            // this is to ensure that we don't lose the message proxy 
            // when the real script tries to throw an error on us
            messageProxies.delete(actualListener)

            return output
        }
    }

    let prevOnMessageValue = null

    const onMessageGetHandler = {
        apply: (target, ctx, args) => {
            // Let's fetch the value first, to trigger and escalate potential errors
            // Illegal invocations like `navigator.__proto__.vendor` will throw here
            const ret = utils.cache.Reflect.apply(...arguments)
            if (args && args.length === 0) {
                return prevOnMessageValue
            }
            return ret
        }
    }

    const onMessageSetHandler = {
        apply: (target, ctx, args) => {
            // trigger errors first just in case
            const ret = utils.cache.Reflect.apply(...arguments)
            if (args && args.length === 1) {
                let value = args[0]
                let listener = null

                if (value) {
                    prevOnMessageValue = value

                    listener = function (evt) {
                        if (evt.data && MAGIC_KEY in evt.data) {
                            return
                        }

                        // we are pretty sure here that evt.source is a root client
                        return value.apply(this, arguments)
                    }
                } else {
                    prevOnMessageValue = null
                }

                // we'll still add the listener to the actual event, this is so
                // we return control back to the real service worker script in cases where we 
                // don't need to spoof things
                return target.apply(ctx, listener)
            }
            return ret
        }
    }

    utils.replaceWithProxy(
        navigator.serviceWorker,
        'addEventListener',
        addEventListenerHandler
    )

    utils.replaceWithProxy(
        navigator.serviceWorker,
        'removeEventListener',
        removeEventListenerHandler
    )

    utils.replaceGetterWithProxy(
        Object.getPrototypeOf(navigator.serviceWorker),
        'onmessage',
        onMessageGetHandler
    )

    utils.replaceSetterWithProxy(
        Object.getPrototypeOf(navigator.serviceWorker),
        'onmessage',
        onMessageSetHandler
    )

    if (!swCanControlPage) {
        // if we deem that the service worker cannot control the page
        // we make the service worker disappear

        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(navigator),
            'serviceWorker',
            utils.makeHandler().getterValue(undefined)
        )

        window.SharedWorker = undefined

        delete window.navigator.serviceWorker
        delete window.SharedWorker
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }