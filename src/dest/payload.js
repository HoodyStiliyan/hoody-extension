spoofBrowser = settings => {console.log('hoody protecc')
// alert(3)
function getUtils() {
    /**
     * A set of shared utility functions specifically for the purpose of modifying native browser APIs without leaving traces.
     *
     * Meant to be passed down in puppeteer and used in the context of the page (everything in here runs in NodeJS as well as a browser).
     *
     * Note: If for whatever reason you need to use this outside of `puppeteer-extra`:
     * Just remove the `module.exports` statement at the very bottom, the rest can be copy pasted into any browser context.
     *
     * Alternatively take a look at the `extract-stealth-evasions` package to create a finished bundle which includes these utilities.
     *
     */
    const utils = {}

    utils.init = () => {
        utils.preloadCache()
    }

    /**
     * Wraps a JS Proxy Handler and strips it's presence from error stacks, in case the traps throw.
     *
     * The presence of a JS Proxy can be revealed as it shows up in error stack traces.
     *
     * @param {object} handler - The JS Proxy handler to wrap
     */
    utils.stripProxyFromErrors = (handler = {}) => {
        const newHandler = {}
        // We wrap each trap in the handler in a try/catch and modify the error stack if they throw
        const traps = Object.getOwnPropertyNames(handler)
        traps.forEach(trap => {
            newHandler[trap] = function () {
                try {
                    // Forward the call to the defined proxy handler
                    return handler[trap].apply(this, arguments || [])
                } catch (err) {
                    // Stack traces differ per browser, we only support chromium based ones currently
                    if (!err || !err.stack || !err.stack.includes(`at `)) {
                        throw err
                    }

                    // When something throws within one of our traps the Proxy will show up in error stacks
                    // An earlier implementation of this code would simply strip lines with a blacklist,
                    // but it makes sense to be more surgical here and only remove lines related to our Proxy.
                    // We try to use a known "anchor" line for that and strip it with everything above it.
                    // If the anchor line cannot be found for some reason we fall back to our blacklist approach.

                    const stripWithBlacklist = (stack, stripFirstLine = true) => {
                        const blacklist = [
                            `at Reflect.${trap} `, // e.g. Reflect.get or Reflect.apply
                            `at Object.${trap} `, // e.g. Object.get or Object.apply
                            `at Object.newHandler.<computed> [as ${trap}] ` // caused by this very wrapper :-)
                        ]
                        return (
                            err.stack
                            .split('\n')
                            // Always remove the first (file) line in the stack (guaranteed to be our proxy)
                            .filter((line, index) => !(index === 1 && stripFirstLine))
                            // Check if the line starts with one of our blacklisted strings
                            .filter(line => !blacklist.some(bl => line.trim().startsWith(bl)))
                            .join('\n')
                        )
                    }

                    const stripWithAnchor = (stack, anchor) => {
                        const stackArr = stack.split('\n')
                        anchor = anchor || `at Object.newHandler.<computed> [as ${trap}] ` // Known first Proxy line in chromium
                        const anchorIndex = stackArr.findIndex(line =>
                            line.trim().startsWith(anchor)
                        )
                        if (anchorIndex === -1) {
                            return false // 404, anchor not found
                        }
                        // Strip everything from the top until we reach the anchor line
                        // Note: We're keeping the 1st line (zero index) as it's unrelated (e.g. `TypeError`)
                        stackArr.splice(1, anchorIndex)
                        return stackArr.join('\n')
                    }

                    // Special cases due to our nested toString proxies
                    err.stack = err.stack.replace(
                        'at Object.toString (',
                        'at Function.toString ('
                    )
                    if ((err.stack || '').includes('at Function.toString (')) {
                        err.stack = stripWithBlacklist(err.stack, false)
                        throw err
                    }

                    // Try using the anchor method, fallback to blacklist if necessary
                    err.stack = stripWithAnchor(err.stack) || stripWithBlacklist(err.stack)

                    throw err // Re-throw our now sanitized error
                }
            }
        })
        return newHandler
    }

    /**
     * Strip error lines from stack traces until (and including) a known line the stack.
     *
     * @param {object} err - The error to sanitize
     * @param {string} anchor - The string the anchor line starts with
     */
    utils.stripErrorWithAnchor = (err, anchor) => {
        const stackArr = err.stack.split('\n')
        const anchorIndex = stackArr.findIndex(line => line.trim().startsWith(anchor))
        if (anchorIndex === -1) {
            return err // 404, anchor not found
        }
        // Strip everything from the top until we reach the anchor line (remove anchor line as well)
        // Note: We're keeping the 1st line (zero index) as it's unrelated (e.g. `TypeError`)
        stackArr.splice(1, anchorIndex)
        err.stack = stackArr.join('\n')
        return err
    }

    /**
     * Replace the property of an object in a stealthy way.
     *
     * Note: You also want to work on the prototype of an object most often,
     * as you'd otherwise leave traces (e.g. showing up in Object.getOwnPropertyNames(obj)).
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperty
     *
     * @example
     * replaceProperty(WebGLRenderingContext.prototype, 'getParameter', { value: "alice" })
     * // or
     * replaceProperty(Object.getPrototypeOf(navigator), 'languages', { get: () => ['en-US', 'en'] })
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The property name to replace
     * @param {object} descriptorOverrides - e.g. { value: "alice" }
     */
    utils.replaceProperty = (obj, propName, descriptorOverrides = {}) => {
        return Object.defineProperty(obj, propName, {
            // Copy over the existing descriptors (writable, enumerable, configurable, etc)
            ...(Object.getOwnPropertyDescriptor(obj, propName) || {}),
            // Add our overrides (e.g. value, get())
            ...descriptorOverrides
        })
    }

    /**
     * Preload a cache of function copies and data.
     *
     * For a determined enough observer it would be possible to overwrite and sniff usage of functions
     * we use in our internal Proxies, to combat that we use a cached copy of those functions.
     *
     * Note: Whenever we add a `Function.prototype.toString` proxy we should preload the cache before,
     * by executing `utils.preloadCache()` before the proxy is applied (so we don't cause recursive lookups).
     *
     * This is evaluated once per execution context (e.g. window)
     */
    utils.preloadCache = () => {
        if (utils.cache) {
            return
        }
        utils.cache = {
            // Used in our proxies
            Reflect: {
                get: Reflect.get.bind(Reflect),
                apply: Reflect.apply.bind(Reflect)
            },
            // Used in `makeNativeString`
            nativeToStringStr: Function.toString + '' // => `function toString() { [native code] }`
        }
    }

    /**
     * Utility function to generate a cross-browser `toString` result representing native code.
     *
     * There's small differences: Chromium uses a single line, whereas FF & Webkit uses multiline strings.
     * To future-proof this we use an existing native toString result as the basis.
     *
     * The only advantage we have over the other team is that our JS runs first, hence we cache the result
     * of the native toString result once, so they cannot spoof it afterwards and reveal that we're using it.
     *
     * @example
     * makeNativeString('foobar') // => `function foobar() { [native code] }`
     *
     * @param {string} [name] - Optional function name
     */
    utils.makeNativeString = (name = '') => {
        return utils.cache.nativeToStringStr.replace('toString', name || '')
    }

    /**
     * Helper function to modify the `toString()` result of the provided object.
     *
     * Note: Use `utils.redirectToString` instead when possible.
     *
     * There's a quirk in JS Proxies that will cause the `toString()` result to differ from the vanilla Object.
     * If no string is provided we will generate a `[native code]` thing based on the name of the property object.
     *
     * @example
     * patchToString(WebGLRenderingContext.prototype.getParameter, 'function getParameter() { [native code] }')
     *
     * @param {object} obj - The object for which to modify the `toString()` representation
     * @param {string} str - Optional string used as a return value
     */
    utils.patchToString = (obj, str = '') => {
        const handler = {
            apply: function (target, ctx) {
                // This fixes e.g. `HTMLMediaElement.prototype.canPlayType.toString + ""`
                if (ctx === Function.prototype.toString) {
                    return utils.makeNativeString('toString')
                }
                // `toString` targeted at our proxied Object detected
                if (ctx === obj) {
                    // We either return the optional string verbatim or derive the most desired result automatically
                    return str || utils.makeNativeString(obj.name)
                }
                // Check if the toString protype of the context is the same as the global prototype,
                // if not indicates that we are doing a check across different windows., e.g. the iframeWithdirect` test case
                const hasSameProto = Object.getPrototypeOf(
                    Function.prototype.toString
                ).isPrototypeOf(ctx.toString) // eslint-disable-line no-prototype-builtins
                if (!hasSameProto) {
                    // Pass the call on to the local Function.prototype.toString instead
                    return ctx.toString()
                }
                return target.call(ctx)
            }
        }

        const toStringProxy = new Proxy(
            Function.prototype.toString,
            utils.stripProxyFromErrors(handler)
        )
        utils.replaceProperty(Function.prototype, 'toString', {
            value: toStringProxy
        })
    }

    /**
     * Make all nested functions of an object native.
     *
     * @param {object} obj
     */
    utils.patchToStringNested = (obj = {}) => {
        return utils.execRecursively(obj, ['function'], utils.patchToString)
    }

    /**
     * Redirect toString requests from one object to another.
     *
     * @param {object} proxyObj - The object that toString will be called on
     * @param {object} originalObj - The object which toString result we wan to return
     */
    utils.redirectToString = (proxyObj, originalObj) => {
        const handler = {
            apply: function (target, ctx) {
                // This fixes e.g. `HTMLMediaElement.prototype.canPlayType.toString + ""`
                if (ctx === Function.prototype.toString) {
                    return utils.makeNativeString('toString')
                }

                // `toString` targeted at our proxied Object detected
                if (ctx === proxyObj) {
                    const fallback = () =>
                        originalObj && originalObj.name ?
                        utils.makeNativeString(originalObj.name) :
                        utils.makeNativeString(proxyObj.name)

                    // Return the toString representation of our original object if possible
                    return originalObj + '' || fallback()
                }

                // Check if the toString protype of the context is the same as the global prototype,
                // if not indicates that we are doing a check across different windows., e.g. the iframeWithdirect` test case
                const hasSameProto = Object.getPrototypeOf(
                    Function.prototype.toString
                ).isPrototypeOf(ctx.toString) // eslint-disable-line no-prototype-builtins
                if (!hasSameProto) {
                    // Pass the call on to the local Function.prototype.toString instead
                    return ctx.toString()
                }

                return target.call(ctx)
            }
        }

        const toStringProxy = new Proxy(
            Function.prototype.toString,
            utils.stripProxyFromErrors(handler)
        )
        utils.replaceProperty(Function.prototype, 'toString', {
            value: toStringProxy
        })
    }

    /**
     * All-in-one method to replace a property with a JS Proxy using the provided Proxy handler with traps.
     *
     * Will stealthify these aspects (strip error stack traces, redirect toString, etc).
     * Note: This is meant to modify native Browser APIs and works best with prototype objects.
     *
     * @example
     * replaceWithProxy(WebGLRenderingContext.prototype, 'getParameter', proxyHandler)
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The name of the property to replace
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.replaceWithProxy = (obj, propName, handler) => {
        const originalObj = obj[propName]
        const proxyObj = new Proxy(obj[propName], utils.stripProxyFromErrors(handler))

        utils.replaceProperty(obj, propName, {
            value: proxyObj
        })
        utils.redirectToString(proxyObj, originalObj)

        return true
    }
    /**
     * All-in-one method to replace a getter with a JS Proxy using the provided Proxy handler with traps.
     *
     * @example
     * replaceGetterWithProxy(Object.getPrototypeOf(navigator), 'vendor', proxyHandler)
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The name of the property to replace
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.replaceGetterWithProxy = (obj, propName, handler) => {
        const fn = Object.getOwnPropertyDescriptor(obj, propName).get
        const fnStr = fn.toString() // special getter function string
        const proxyObj = new Proxy(fn, utils.stripProxyFromErrors(handler))

        utils.replaceProperty(obj, propName, {
            get: proxyObj
        })
        utils.patchToString(proxyObj, fnStr)

        return true
    }

    /**
     * All-in-one method to mock a non-existing property with a JS Proxy using the provided Proxy handler with traps.
     *
     * Will stealthify these aspects (strip error stack traces, redirect toString, etc).
     *
     * @example
     * mockWithProxy(chrome.runtime, 'sendMessage', function sendMessage() {}, proxyHandler)
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The name of the property to replace or create
     * @param {object} pseudoTarget - The JS Proxy target to use as a basis
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.mockWithProxy = (obj, propName, pseudoTarget, handler) => {
        const proxyObj = new Proxy(pseudoTarget, utils.stripProxyFromErrors(handler))

        utils.replaceProperty(obj, propName, {
            value: proxyObj
        })
        utils.patchToString(proxyObj)

        return true
    }

    /**
     * All-in-one method to create a new JS Proxy with stealth tweaks.
     *
     * This is meant to be used whenever we need a JS Proxy but don't want to replace or mock an existing known property.
     *
     * Will stealthify certain aspects of the Proxy (strip error stack traces, redirect toString, etc).
     *
     * @example
     * createProxy(navigator.mimeTypes.__proto__.namedItem, proxyHandler) // => Proxy
     *
     * @param {object} pseudoTarget - The JS Proxy target to use as a basis
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.createProxy = (pseudoTarget, handler) => {
        const proxyObj = new Proxy(pseudoTarget, utils.stripProxyFromErrors(handler))
        utils.patchToString(proxyObj)

        return proxyObj
    }

    /**
     * Helper function to split a full path to an Object into the first part and property.
     *
     * @example
     * splitObjPath(`HTMLMediaElement.prototype.canPlayType`)
     * // => {objName: "HTMLMediaElement.prototype", propName: "canPlayType"}
     *
     * @param {string} objPath - The full path to an object as dot notation string
     */
    utils.splitObjPath = objPath => ({
        // Remove last dot entry (property) ==> `HTMLMediaElement.prototype`
        objName: objPath.split('.').slice(0, -1).join('.'),
        // Extract last dot entry ==> `canPlayType`
        propName: objPath.split('.').slice(-1)[0]
    })

    /**
     * Convenience method to replace a property with a JS Proxy using the provided objPath.
     *
     * Supports a full path (dot notation) to the object as string here, in case that makes it easier.
     *
     * @example
     * replaceObjPathWithProxy('WebGLRenderingContext.prototype.getParameter', proxyHandler)
     *
     * @param {string} objPath - The full path to an object (dot notation string) to replace
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.replaceObjPathWithProxy = (objPath, handler) => {
        const {
            objName,
            propName
        } = utils.splitObjPath(objPath)
        const obj = eval(objName) // eslint-disable-line no-eval
        return utils.replaceWithProxy(obj, propName, handler)
    }

    /**
     * Traverse nested properties of an object recursively and apply the given function on a whitelist of value types.
     *
     * @param {object} obj
     * @param {array} typeFilter - e.g. `['function']`
     * @param {Function} fn - e.g. `utils.patchToString`
     */
    utils.execRecursively = (obj = {}, typeFilter = [], fn) => {
        function recurse(obj) {
            for (const key in obj) {
                if (obj[key] === undefined) {
                    continue
                }
                if (obj[key] && typeof obj[key] === 'object') {
                    recurse(obj[key])
                } else {
                    if (obj[key] && typeFilter.includes(typeof obj[key])) {
                        fn.call(this, obj[key])
                    }
                }
            }
        }
        recurse(obj)
        return obj
    }

    /**
     * Everything we run through e.g. `page.evaluate` runs in the browser context, not the NodeJS one.
     * That means we cannot just use reference variables and functions from outside code, we need to pass everything as a parameter.
     *
     * Unfortunately the data we can pass is only allowed to be of primitive types, regular functions don't survive the built-in serialization process.
     * This utility function will take an object with functions and stringify them, so we can pass them down unharmed as strings.
     *
     * We use this to pass down our utility functions as well as any other functions (to be able to split up code better).
     *
     * @see utils.materializeFns
     *
     * @param {object} fnObj - An object containing functions as properties
     */
    utils.stringifyFns = (fnObj = {
        hello: () => 'world'
    }) => {
        // Object.fromEntries() ponyfill (in 6 lines) - supported only in Node v12+, modern browsers are fine
        // https://github.com/feross/fromentries
        function fromEntries(iterable) {
            return [...iterable].reduce((obj, [key, val]) => {
                obj[key] = val
                return obj
            }, {})
        }
        return (Object.fromEntries || fromEntries)(
            Object.entries(fnObj)
            .filter(([key, value]) => typeof value === 'function')
            .map(([key, value]) => [key, value.toString()]) // eslint-disable-line no-eval
        )
    }

    /**
     * Utility function to reverse the process of `utils.stringifyFns`.
     * Will materialize an object with stringified functions (supports classic and fat arrow functions).
     *
     * @param {object} fnStrObj - An object containing stringified functions as properties
     */
    utils.materializeFns = (fnStrObj = {
        hello: "() => 'world'"
    }) => {
        return Object.fromEntries(
            Object.entries(fnStrObj).map(([key, value]) => {
                if (value.startsWith('function')) {
                    // some trickery is needed to make oldschool functions work :-)
                    return [key, eval(`() => ${value}`)()] // eslint-disable-line no-eval
                } else {
                    // arrow functions just work
                    return [key, eval(value)] // eslint-disable-line no-eval
                }
            })
        )
    }

    // Proxy handler templates for re-usability
    utils.makeHandler = () => ({
        // Used by simple `navigator` getter evasions
        getterValue: value => ({
            apply(target, ctx, args) {
                // Let's fetch the value first, to trigger and escalate potential errors
                // Illegal invocations like `navigator.__proto__.vendor` will throw here
                const ret = utils.cache.Reflect.apply(...arguments)
                if (args && args.length === 0) {
                    return value
                }
                return ret
            }
        })
    })

    utils.init()

    utils.generateMagicArray = function (dataArray = [], proto = MimeTypeArray.prototype, itemProto = MimeType.prototype, itemMainProp = 'type') {
        // Quick helper to set props with the same descriptors vanilla is using
        const defineProp = (obj, prop, value) => Object.defineProperty(obj, prop, {
            value,
            writable: false,
            enumerable: false, // Important for mimeTypes & plugins: `JSON.stringify(navigator.mimeTypes)`
            configurable: true
        })

        // Loop over our fake data and construct items
        const makeItem = data => {
            const item = {}
            for (const prop of Object.keys(data)) {
                if (prop.startsWith('__')) {
                    continue
                }
                defineProp(item, prop, data[prop])
            }
            return patchItem(item, data)
        }

        const patchItem = (item, data) => {
            let descriptor = Object.getOwnPropertyDescriptors(item)

            // Special case: Plugins have a magic length property which is not enumerable
            // e.g. `navigator.plugins[i].length` should always be the length of the assigned mimeTypes
            if (itemProto === Plugin.prototype) {
                descriptor = {
                    ...descriptor,
                    length: {
                        value: data.__mimeTypes.length,
                        writable: false,
                        enumerable: false,
                        configurable: true // Important to be able to use the ownKeys trap in a Proxy to strip `length`
                    }
                }
            }

            // We need to spoof a specific `MimeType` or `Plugin` object
            const obj = Object.create(itemProto, descriptor)

            // Virtually all property keys are not enumerable in vanilla
            const blacklist = [...Object.keys(data), 'length', 'enabledPlugin']
            return new Proxy(obj, {
                ownKeys(target) {
                    return Reflect.ownKeys(target).filter(k => !blacklist.includes(k))
                },
                getOwnPropertyDescriptor(target, prop) {
                    if (blacklist.includes(prop)) {
                        return undefined
                    }
                    return Reflect.getOwnPropertyDescriptor(target, prop)
                }
            })
        }

        const magicArray = []

        // Loop through our fake data and use that to create convincing entities
        dataArray.forEach(data => {
            magicArray.push(makeItem(data))
        })

        // Add direct property access  based on types (e.g. `obj['application/pdf']`) afterwards
        magicArray.forEach(entry => {
            defineProp(magicArray, entry[itemMainProp], entry)
        })

        // This is the best way to fake the type to make sure this is false: `Array.isArray(navigator.mimeTypes)`
        const magicArrayObj = Object.create(proto, {
            ...Object.getOwnPropertyDescriptors(magicArray),

            // There's one ugly quirk we unfortunately need to take care of:
            // The `MimeTypeArray` prototype has an enumerable `length` property,
            // but headful Chrome will still skip it when running `Object.getOwnPropertyNames(navigator.mimeTypes)`.
            // To strip it we need to make it first `configurable` and can then overlay a Proxy with an `ownKeys` trap.
            length: {
                value: magicArray.length,
                writable: false,
                enumerable: false,
                configurable: true // Important to be able to use the ownKeys trap in a Proxy to strip `length`
            }
        })

        // Generate our functional function mocks :-)
        const functionMocks = utils.generateFunctionMocks(proto, itemMainProp, magicArray)

        // We need to overlay our custom object with a JS Proxy
        const magicArrayObjProxy = new Proxy(magicArrayObj, {
            get(target, key = '') {
                // Redirect function calls to our custom proxied versions mocking the vanilla behavior
                if (key === 'item') {
                    return functionMocks.item
                }
                if (key === 'namedItem') {
                    return functionMocks.namedItem
                }
                if (proto === PluginArray.prototype && key === 'refresh') {
                    return functionMocks.refresh
                }
                // Everything else can pass through as normal
                return utils.cache.Reflect.get(...arguments)
            },
            ownKeys(target) {
                // There are a couple of quirks where the original property demonstrates "magical" behavior that makes no sense
                // This can be witnessed when calling `Object.getOwnPropertyNames(navigator.mimeTypes)` and the absense of `length`
                // My guess is that it has to do with the recent change of not allowing data enumeration and this being implemented weirdly
                // For that reason we just completely fake the available property names based on our data to match what regular Chrome is doing
                // Specific issues when not patching this: `length` property is available, direct `types` props (e.g. `obj['application/pdf']`) are missing
                const keys = []
                const typeProps = magicArray.map(mt => mt[itemMainProp])
                typeProps.forEach((_, i) => keys.push(`${i}`))
                typeProps.forEach(propName => keys.push(propName))
                return keys
            },
            getOwnPropertyDescriptor(target, prop) {
                if (prop === 'length') {
                    return undefined
                }
                return Reflect.getOwnPropertyDescriptor(target, prop)
            }
        })

        return magicArrayObjProxy
    }

    utils.generateFunctionMocks = function (proto, itemMainProp, dataArray) {
        return {
            /** Returns the MimeType object with the specified index. */
            item: utils.createProxy(proto.item, {
                apply(target, ctx, args) {
                    if (!args.length) {
                        throw new TypeError(
                            `Failed to execute 'item' on '${
                                 proto[Symbol.toStringTag]
                                 }': 1 argument required, but only 0 present.`
                        )
                    }
                    // Special behavior alert:
                    // - Vanilla tries to cast strings to Numbers (only integers!) and use them as property index lookup
                    // - If anything else than an integer (including as string) is provided it will return the first entry
                    const isInteger = args[0] && Number.isInteger(Number(args[0])) // Cast potential string to number first, then check for integer
                    // Note: Vanilla never returns `undefined`
                    return (isInteger ? dataArray[Number(args[0])] : dataArray[0]) || null
                }
            }),
            /** Returns the MimeType object with the specified name. */
            namedItem: utils.createProxy(proto.namedItem, {
                apply(target, ctx, args) {
                    if (!args.length) {
                        throw new TypeError(
                            `Failed to execute 'namedItem' on '${
                                     proto[Symbol.toStringTag]
                                     }': 1 argument required, but only 0 present.`
                        )
                    }
                    return dataArray.find(mt => mt[itemMainProp] === args[0]) || null // Not `undefined`!
                }
            }),
            /** Does nothing and shall return nothing */
            refresh: proto.refresh ?
                utils.createProxy(proto.refresh, {
                    apply(target, ctx, args) {
                        return undefined
                    }
                }) : undefined
        }
    }

    utils.generateMimeTypeArray = function (mimeTypesData) {
        return utils.generateMagicArray(
            mimeTypesData,
            MimeTypeArray.prototype,
            MimeType.prototype,
            'type'
        )
    }

    utils.generatePluginArray = function (pluginsData) {
        return utils.generateMagicArray(
            pluginsData,
            PluginArray.prototype,
            Plugin.prototype,
            'name'
        )
    }

    utils.setDynamicPropOfProt = function (proto, propName, valueFunc) {
        if (proto.__defineGetter__) {
            proto.__defineGetter__(propName, valueFunc)
        } else if (Object.defineProperty) {
            Object.defineProperty(proto, propName, {
                get: valueFunc
            })
        }
        // Works on Safari
        if (proto[propName] !== value) {
            var valueProp = {
                get: valueFunc
            }
            try {
                Object.defineProperty(proto, propName, valueProp)
            } catch (e) {
                let _val = {}
                _val[propName] = valueProp
                proto = Object.create(proto, _val)
            }
        }

        // try {
        //     utils.replaceGetterWithProxy(
        //         proto,
        //         propName,
        //         utils.makeHandler().getterValue(value)
        //     )
        // } catch {}
    }

    utils.setPropOfProt = function (proto, propName, value) {
        if (proto.__defineGetter__) {
            proto.__defineGetter__(propName, function () {
                return value;
            })
        } else if (Object.defineProperty) {
            Object.defineProperty(proto, propName, {
                get: function () {
                    return value;
                }
            })
        }
        // Works on Safari
        if (proto[propName] !== value) {
            var valueProp = {
                get: function () {
                    return value;
                }
            }
            try {
                Object.defineProperty(proto, propName, valueProp)
            } catch (e) {
                let _val = {}
                _val[propName] = valueProp
                proto = Object.create(proto, _val)
            }
        }

        try {
            utils.replaceGetterWithProxy(
                proto,
                propName,
                utils.makeHandler().getterValue(value)
            )
        } catch {}

        try {
            // rewrite native string
            Object.defineProperty(proto[propName], 'toString', {
                value: function () {
                    return (Function.toString + '').replace(' toString', ' ' + propName)
                }
            })
        } catch {}
    }

    utils.redefineFunctionOfObject = function (object, FuncName, handler) {
        Object.defineProperty(Object.getPrototypeOf(object), FuncName, {
            value: handler(object[FuncName].bind(object))
        })

        try {
            Object.defineProperty(object.prototype, FuncName, {
                value: handler(object.prototype[FuncName].bind(object))
            })
        } catch {}

        // rewrite native string
        Object.defineProperty((Object.getPrototypeOf(object))[FuncName], 'toString', {
            value: function () {
                return (Function.toString + '').replace(' toString', ' ' + FuncName)
            }
        })
    }

    // used for stuff like Number.prototype where the function relies on 'this'
    // otherwise use utils.redefineFunctionOfObject
    utils.redefineFunctionOfObjectProto = function (object, FuncName, handler) {
        Object.defineProperty(object, FuncName, {
            configurable: true,
            value: handler(object[FuncName])
        })

        try {
            Object.defineProperty(object, FuncName, {
                configurable: true,
                value: handler(object.prototype[FuncName])
            })
        } catch {}

        // rewrite native string
        Object.defineProperty((object)[FuncName], 'toString', {
            value: function () {
                return (Function.toString + '').replace(' toString', ' ' + FuncName)
            }
        })
    }

    utils.cookieWorker = function () {
        /*!
         * cookie
         * Copyright(c) 2012-2014 Roman Shtylman
         * Copyright(c) 2015 Douglas Christopher Wilson
         * Copyright(c) 2016 Jeff Kohrman
         * MIT Licensed
         */

        'use strict';

        /**
         * Module exports.
         * @public
         */

        /**
         * Module variables.
         * @private
         */

        var decode = decodeURIComponent;
        var encode = encodeURIComponent;
        var pairSplitRegExp = /; */;

        /**
         * RegExp to match field-content in RFC 7230 sec 3.2
         *
         * field-content = field-vchar [ 1*( SP / HTAB ) field-vchar ]
         * field-vchar   = VCHAR / obs-text
         * obs-text      = %x80-FF
         */

        var fieldContentRegExp = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;

        /**
         * Parse a cookie header.
         *
         * Parse the given cookie header string into an object
         * The object has the various cookies as keys(names) => values
         *
         * @param {string} str
         * @param {object} [options]
         * @return {object}
         * @public
         */

        function parse(str, options) {
            if (typeof str !== 'string') {
                throw new TypeError('argument str must be a string');
            }

            var obj = {}
            var opt = options || {};
            var pairs = str.split(pairSplitRegExp);
            var dec = opt.decode || decode;

            for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i];
                var eq_idx = pair.indexOf('=');

                // set true for things that don't look like key=value
                var key;
                var val;
                if (eq_idx < 0) {
                    key = pair.trim();
                    val = 'true';
                } else {
                    key = pair.substr(0, eq_idx).trim()
                    val = pair.substr(++eq_idx, pair.length).trim();
                };

                // quoted values
                if ('"' == val[0]) {
                    val = val.slice(1, -1);
                }

                // only assign once
                if (key.trim().length > 0) {
                    obj[key] = tryDecode(val, dec);
                }
            }

            return obj;
        }

        /**
         * Serialize data into a cookie header.
         *
         * Serialize the a name value pair into a cookie string suitable for
         * http headers. An optional options object specified cookie parameters.
         *
         * serialize('foo', 'bar', { httpOnly: true })
         *   => "foo=bar; httpOnly"
         *
         * @param {string} name
         * @param {string} val
         * @param {object} [options]
         * @return {string}
         * @public
         */

        function serialize(name, val, options) {
            var opt = options || {};
            var enc = opt.encode || encode;

            if (typeof enc !== 'function') {
                throw new TypeError('option encode is invalid');
            }

            if (!fieldContentRegExp.test(name)) {
                throw new TypeError('argument name is invalid');
            }

            var value = enc(val);

            if (value && !fieldContentRegExp.test(value)) {
                throw new TypeError('argument val is invalid');
            }

            var str = name + '=' + value;

            if (null != opt.maxAge) {
                var maxAge = opt.maxAge - 0;
                if (isNaN(maxAge)) throw new Error('maxAge should be a Number');
                str += '; Max-Age=' + Math.floor(maxAge);
            }

            if (opt.domain) {
                if (!fieldContentRegExp.test(opt.domain)) {
                    throw new TypeError('option domain is invalid');
                }

                str += '; Domain=' + opt.domain;
            }

            if (opt.path) {
                if (!fieldContentRegExp.test(opt.path)) {
                    throw new TypeError('option path is invalid');
                }

                str += '; Path=' + opt.path;
            }

            if (opt.expires) {
                if (typeof opt.expires.toUTCString !== 'function') {
                    throw new TypeError('option expires is invalid');
                }

                str += '; Expires=' + opt.expires.toUTCString();
            }

            if (opt.httpOnly) {
                str += '; HttpOnly';
            }

            if (opt.secure) {
                str += '; Secure';
            }

            if (opt.sameSite) {
                var sameSite = typeof opt.sameSite === 'string' ?
                    opt.sameSite.toLowerCase() : opt.sameSite;

                switch (sameSite) {
                    case true:
                        str += '; SameSite=Strict';
                        break;
                    case 'lax':
                        str += '; SameSite=Lax';
                        break;
                    case 'strict':
                        str += '; SameSite=Strict';
                        break;
                    default:
                        throw new TypeError('option sameSite is invalid');
                }
            }

            return str;
        }

        /**
         * Try decoding a string using a decoding function.
         *
         * @param {string} str
         * @param {function} decode
         * @private
         */

        function tryDecode(str, decode) {
            try {
                return decode(str);
            } catch (e) {
                return str;
            }
        }

        return {
            tryDecode,
            serialize,
            parse,
        }
    }

    /**
     * All-in-one method to replace a setter with a JS Proxy using the provided Proxy handler with traps.
     *
     * @example
     * replaceSetterWithProxy(Object.getPrototypeOf(navigator), 'vendor', proxyHandler)
     *
     * @param {object} obj - The object which has the property to replace
     * @param {string} propName - The name of the property to replace
     * @param {object} handler - The JS Proxy handler to use
     */
    utils.replaceSetterWithProxy = (obj, propName, handler) => {
        const fn = Object.getOwnPropertyDescriptor(obj, propName).set
        const fnStr = fn.toString() // special setter function string
        const proxyObj = new Proxy(fn, utils.stripProxyFromErrors(handler))

        utils.replaceProperty(obj, propName, {
            set: proxyObj
        })
        utils.patchToString(proxyObj, fnStr)

        return true
    }
    return utils
}

const utils = getUtils()
// disables all events, uses bugs like document.writeln and document write script src text/undefiend
// while loops (in very rare cases), and docment.stop
function crashPage( status ) {
    if (typeof status === 'string') alert(status)
    
    window.addEventListener('error', function (e) {e.preventDefault();e.stopPropagation();}, false)

    var handlers = [
        'copy', 'cut', 'paste',
        'beforeunload', 'blur', 'change', 'click', 'contextmenu', 'dblclick', 'focus', 'keydown', 'keypress', 'keyup', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'resize', 'scroll',
        'DOMNodeInserted', 'DOMNodeRemoved', 'DOMNodeRemovedFromDocument', 'DOMNodeInsertedIntoDocument', 'DOMAttrModified', 'DOMCharacterDataModified', 'DOMElementNameChanged', 'DOMAttributeNameChanged', 'DOMActivate', 'DOMFocusIn', 'DOMFocusOut', 'online', 'offline', 'textInput',
        'abort', 'close', 'dragdrop', 'load', 'paint', 'reset', 'select', 'submit', 'unload'
    ]

    function stopPropagation (e) {
        try {
            e.stopPropagation()
            e.preventDefault() // Stop for the form controls, etc., too?
        } catch { }
    }
    handlers.map(h => window.addEventListener(h, function (e) { stopPropagation(e) }, true))
    document.writeln(' ')
    try {
        window.stop()
        window.document.execCommand('Stop')
    } catch {
        try {
            // crash the page with browser bug
            window.document.write('<script type="text/undefined">')
            // stop with while loop
            while(true) {}
        }
        catch { }
    }
    throw ''
}

if(settings == undefined || typeof settings != 'object') {
    // cancel the page from loading

    crashPage('Hoody protection layer did not load correctly, so your page will not load for your safety!')
}
// settings.spoofAudio

try {
    if(settings.spoofAudio == true){
        const context = {
            BUFFER: null,
            getChannelData: function (e) {
                const getChannelData = e.prototype.getChannelData;
                Object.defineProperty(e.prototype, 'getChannelData', {
                    value: function () {
                        const results_1 = getChannelData.apply(this, arguments);
                        if (context.BUFFER !== results_1) {
                            context.BUFFER = results_1;
                            for (let i = 0; i < results_1.length; i += 100) {
                                const index = Math.floor(settings.random * i + 1000);
                                results_1[index] = results_1[index] + settings.random * 0.0000001;
                            }
                        }
                        //
                        return results_1;
                    },
                });
            },
            createAnalyser: function (e) {
                const createAnalyser = e.prototype.__proto__.createAnalyser;
                Object.defineProperty(e.prototype.__proto__, 'createAnalyser', {
                    value: function () {
                        const results_2 = createAnalyser.apply(this, arguments);
                        const getFloatFrequencyData = results_2.__proto__.getFloatFrequencyData;
                        Object.defineProperty(
                            results_2.__proto__,
                            'getFloatFrequencyData', {
                                value: function () {
                                    const results_3 = getFloatFrequencyData.apply(
                                        this,
                                        arguments
                                    );
                                    for (let i = 0; i < arguments[0].length; i += 100) {
                                        const index = Math.floor(settings.random * i);
                                        arguments[0][index] = arguments[0][index] + settings.random * 0.1;
                                    }
                                    //
                                    return results_3;
                                },
                            }
                        );
                        //
                        return results_2;
                    },
                });
            },
        };
        //
        context.getChannelData(AudioBuffer);
        context.createAnalyser(AudioContext);
        context.getChannelData(OfflineAudioContext);
        context.createAnalyser(OfflineAudioContext);
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    const tabHostname = settings['x-hdy-main-frame-host']
    let old_BroadcastChannel = window.BroadcastChannel

    try {
        let old_name_getter = Object.getOwnPropertyDescriptor(window.BroadcastChannel.prototype, 'name').get
        utils.setDynamicPropOfProt(window.BroadcastChannel.prototype, 'name', function() {
            return (old_name_getter.bind(this)())
                .split('|')
                .filter(x => x.trim().length > 0)
                .slice(0, -1)
                .join('|')
        })
    } catch {}

    // Intl.BroadcastChannel spoof
    utils.setPropOfProt(window, 'BroadcastChannel', function BroadcastChannel(name) {
        return new old_BroadcastChannel(name + '|' + tabHostname)
    })

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
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
// settings.spoofCanvas

try {
    if(settings.spoofCanvas == true) {
        const toBlob = HTMLCanvasElement.prototype.toBlob;
        const toDataURL = HTMLCanvasElement.prototype.toDataURL;
        const getImageData = CanvasRenderingContext2D.prototype.getImageData;
        //
        const noisify = function (canvas, context) {
            const shift = {
                r: Math.floor(settings.random * 10) - 5,
                g: Math.floor(settings.random * 10) - 5,
                b: Math.floor(settings.random * 10) - 5,
                a: Math.floor(settings.random * 10) - 5,
            };
            //
            const width = canvas.width,
                height = canvas.height;
            const imageData = getImageData.apply(context, [0, 0, width, height]);
            for (let i = 0; i < height; i++)
                for (let j = 0; j < width; j++) {
                    const n = i * (width * 4) + j * 4;
                    imageData.data[n + 0] = imageData.data[n + 0] + shift.r;
                    imageData.data[n + 1] = imageData.data[n + 1] + shift.g;
                    imageData.data[n + 2] = imageData.data[n + 2] + shift.b;
                    imageData.data[n + 3] = imageData.data[n + 3] + shift.a;
                }

            //
            context.putImageData(imageData, 0, 0);
        };
        //
        Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
            value: function () {
                noisify(this, this.getContext('2d'));
                return toBlob.apply(this, arguments);
            },
        });
        //
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
            value: function () {
                noisify(this, this.getContext('2d'));
                return toDataURL.apply(this, arguments);
            },
        });
        //
        Object.defineProperty(
            CanvasRenderingContext2D.prototype,
            'getImageData', {
                value: function () {
                    noisify(this.canvas, this);
                    return getImageData.apply(this, arguments);
                },
            }
        );
        //Webgl def
        const config = {
            random: {
                value: function () {
                    return settings.random;
                },
                item: function (e) {
                    const rand = e.length * config.random.value();
                    return e[Math.floor(rand)];
                },
                array: function (e) {
                    const rand = config.random.item(e);
                    return new Int32Array([rand, rand]);
                },
                items: function (e, n) {
                    let length = e.length;
                    const result = new Array(n);
                    const taken = new Array(length);
                    if (n > length) n = length;
                    //
                    while (n--) {
                        const i = Math.floor(config.random.value() * length);
                        result[n] = e[i in taken ? taken[i] : i];
                        taken[i] = --length in taken ? taken[length] : length;
                    }
                    //
                    return result;
                },
            },
            spoof: {
                webgl: {
                    buffer: function (target) {
                        const bufferData = target.prototype.bufferData;
                        Object.defineProperty(target.prototype, 'bufferData', {
                            value: function () {
                                const index = Math.floor(config.random.value() * 10);
                                const noise = 0.1 * config.random.value() * arguments[1][index];
                                arguments[1][index] = arguments[1][index] + noise;
                                //
                                return bufferData.apply(this, arguments);
                            },
                        });
                    },
                    parameter: function (target) {
                        const getParameter = target.prototype.getParameter;
                        Object.defineProperty(target.prototype, 'getParameter', {
                            value: function () {
                                const float32array = new Float32Array([1, 8192]);
                                //
                                if (arguments[0] === 3415) return 0;
                                else if (arguments[0] === 3414) return 24;
                                else if (arguments[0] === 35661)
                                    return config.random.items([128, 192, 256]);
                                else if (arguments[0] === 3386)
                                    return config.random.array([8192, 16384, 32768]);
                                else if (arguments[0] === 36349 || arguments[0] === 36347)
                                    return config.random.item([4096, 8192]);
                                else if (arguments[0] === 34047 || arguments[0] === 34921)
                                    return config.random.items([2, 4, 8, 16]);
                                else if (
                                    arguments[0] === 7937 || arguments[0] === 33901 || arguments[0] === 33902
                                )
                                    return float32array;
                                else if (
                                    arguments[0] === 34930 || arguments[0] === 36348 || arguments[0] === 35660
                                )
                                    return config.random.item([16, 32, 64]);
                                else if (
                                    arguments[0] === 34076 || arguments[0] === 34024 || arguments[0] === 3379
                                )
                                    return config.random.item([16384, 32768]);
                                else if (
                                    arguments[0] === 3413 || arguments[0] === 3412 || arguments[0] === 3411 || arguments[0] === 3410 || arguments[0] === 34852
                                )
                                    return config.random.item([2, 4, 8, 16]);
                                else
                                    return config.random.item([
                                        0,
                                        2,
                                        4,
                                        8,
                                        16,
                                        32,
                                        64,
                                        128,
                                        256,
                                        512,
                                        1024,
                                        2048,
                                        4096,
                                    ]);
                                //
                                return getParameter.apply(this, arguments);
                            },
                        });
                    },
                },
            },
        };
        //
        config.spoof.webgl.buffer(WebGLRenderingContext);
        config.spoof.webgl.buffer(WebGL2RenderingContext);
        config.spoof.webgl.parameter(WebGLRenderingContext);
        config.spoof.webgl.parameter(WebGL2RenderingContext);
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    function getCookieSupport() {
        var persist = true
        do {
            var c= 'gCStest='+Math.floor(Math.random()*100000000)
            document.cookie= persist? c+';expires=Tue, 01-Jan-2030 00:00:00 GMT' : c
            if (document.cookie.indexOf(c)!==-1) {
                document.cookie= c+';expires=Sat, 01-Jan-2000 00:00:00 GMT'
                return persist
            }
        } while (!(persist= !persist))
        return null
    }

    if(getCookieSupport()) {
        let worker = utils.cookieWorker()
        const tabHostname = settings['x-hdy-main-frame-host']
    
        var cookieDesc = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie') ||
                     Object.getOwnPropertyDescriptor(window.HTMLDocument.prototype, 'cookie')
        var oldCookie = cookieDesc.get.call(window.document)
    
        function appendHostname(str) {
            // parse to object
            let parsed = worker.parse(str)

            let appended = {}
    
            // apend hostname
            for(let key in parsed) {
                // don't append hostname to keywords
                if(['expires', 'path', 'SameSite', 'Secure'].includes(key)) {
                    appended[key] = parsed[key]
                    continue    
                }

                // this one is special, don't touch it
                if(key == 'hoodyOK') {
                    appended[key] = parsed[key]
                    continue
                }
    
                appended[key + '|' + tabHostname] = parsed[key]
            }
    
            // serialize back to normal string
            let final = ''
            for(let key in appended) {
                if(key.trim() == '|' + tabHostname) return ''
    
                if(appended[key] == 'true') {
                    final += key + '; '
                    break;
                }
                
                final += worker.serialize(key, appended[key]) + '; '
            }
    
            return decodeURIComponent(final)
        }
    
        function removeHostname(str) {
            // parse to object
            let parsed = worker.parse(str)
    
            let appended = {}
    
            // remove hostname
            for(let key in parsed) {
                let _hostname = key.split('|').reverse()[0]
                let rest = key.split('|').slice(0, -1).join('|')

                // cookie is comming from the http response
                if(rest.trim().length == 0) {
                    appended[key] = parsed[key]
                    continue
                }

                if(_hostname == tabHostname)
                    appended[rest] = parsed[key]
            }
    
            // serialize back to normal string
            let final = ''
            for(let key in appended) {
                if(key.trim() == '|' + tabHostname) return ''
    
                if(appended[key] == 'true') {
                    final += key + '; '
                    break;
                }
                
                final += worker.serialize(key, appended[key]) + '; '
            }
    
            let ret = decodeURIComponent(final).trim()
            if(ret[ret.length - 1] == ';') ret = ret.slice(0, -1)
            return ret
        }
    
        if (cookieDesc) {
            Object.defineProperty(window.document, 'cookie', {
                configurable: true,
    
                get: function () {
                    return removeHostname(cookieDesc.get.call(window.document))
                },
                set: function (val) {
                    return cookieDesc.set.call(window.document, appendHostname(val))
                }
            })
        }
    
        // we deleted the cookie so we need to rewrite it back
        window.document.cookie = removeHostname(oldCookie)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
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
try {
    const rand = {
        noise: function () {
            const SIGN = settings.random < settings.random ? -1 : 1;
            return Math.floor(settings.random + SIGN * settings.random);
        },
        sign: function () {
            const tmp = [-1, -1, -1, -1, -1, -1, +1, -1, -1, -1];
            const index = Math.floor(settings.random * tmp.length);
            return tmp[index];
        },
    };
    //
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        get() {
            const height = Math.floor(this.getBoundingClientRect().height);
            const result = height + rand.noise()
            return result;
        },
    });
    //
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get() {
            const width = Math.floor(this.getBoundingClientRect().width);
            const result = width + rand.noise()
            return result;
        },
    });
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.gps: GeolocationCoordinates
// https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates

try {
    if(settings.gps) {
        utils.redefineFunctionOfObject(
            window.navigator.geolocation,
            'getCurrentPosition',
            getCurrentPosition => {
                return function (success, error, options) {
                    if(!success) return getCurrentPosition()
                    return getCurrentPosition(res => {
                        Object.keys(settings.gps).map(key => {
                            utils.setPropOfProt(
                                Object.getPrototypeOf(res.coords), 
                                key, 
                                settings.gps[key]
                            )
                        })
                        success(res)
                    }, error, options)
                }
            }
        )

        utils.redefineFunctionOfObject(
            window.navigator.geolocation,
            'watchPosition',
            watchPosition => {
                return function (success, error, options) {
                    if(!success) return watchPosition()
                    return watchPosition(res => {
                        Object.keys(settings.gps).map(key => {
                            utils.setPropOfProt(
                                Object.getPrototypeOf(res.coords), 
                                key, 
                                settings.gps[key]
                            )
                        })
                        success(res)
                    }, error, options)
                }
            }
        )

        utils.redefineFunctionOfObject(
            window.navigator.geolocation,
            'clearWatch',
            clearWatch => {
                return function (id) {
                    return clearWatch(id)
                }
            }
        )
    }

} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.hardwareConcurrency

try {
    if(settings.hardwareConcurrency != undefined) {
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(window.navigator),
            'hardwareConcurrency',
            utils.makeHandler().getterValue(settings.hardwareConcurrency)
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
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
// settings.languages

try {
    if(settings.languages) {
        const languages = settings.languages
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(navigator),
            'languages',
            utils.makeHandler().getterValue(Object.freeze([...languages]))
        )
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(navigator),
            'language',
            utils.makeHandler().getterValue(Object.freeze(languages[0]))
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
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
// settings.spoofMath

try {
    if(settings.spoofMath == true) {
        let f = () => 0
        let abs = Math.abs || f
        let acos = Math.acos || f
        let acosh = Math.acosh || f
        let asin = Math.asin || f
        let asinh = Math.asinh || f
        let atanh = Math.atanh || f
        let atan = Math.atan || f
        let sin = Math.sin || f
        let sinh = Math.sinh || f
        let cos = Math.cos || f
        let cosh = Math.cosh || f
        let tan = Math.tan || f
        let tanh = Math.tanh || f
        let exp = Math.exp || f
        let expm1 = Math.expm1 || f
        let log1p = Math.log1p || f

        // 5.5 == 5.5000000000000001
        // true

        const r = () => {
            const rr = () => Math.floor(settings.random * 9) + 1
            return settings.random > 0.1 ? Number(`0.000000000000000${rr()}`) : 0
        }

        Math.abs = v => abs(v) + r()
        Math.acos = v => acos(v) + r()
        Math.acosh = v => acosh(v) + r()
        Math.asin = v => asin(v) + r()
        Math.asinh = v => asinh(v) + r()
        Math.atanh = v => atanh(v) + r()
        Math.atan = v => atan(v) + r()
        Math.sin = v => sin(v) + r()
        Math.sinh = v => sinh(v) + r()
        Math.cos = v => cos(v) + r()
        Math.cosh = v => cosh(v) + r()
        Math.tan = v => tan(v) + r()
        Math.tanh = v => tanh(v) + r()
        Math.exp = v => exp(v) + r()
        Math.acos = v => acos(v) + r()
        Math.expm1 = v => expm1(v) + r()
        Math.log1p = v => log1p(v) + r()
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    if(settings.spoofMeasurements) {
        utils.redefineFunctionOfObjectProto(
            window.HTMLElement.prototype, 
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
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    /**
     * Input might look funky, we need to normalize it so e.g. whitespace isn't an issue for our spoofing.
     *
     * @example
     * video/webm; codecs="vp8, vorbis"
     * video/mp4; codecs="avc1.42E01E"
     * audio/x-m4a;
     * audio/ogg; codecs="vorbis"
     * @param {String} arg
     */
    const parseInput = arg => {
        const [mime, codecStr] = arg.trim().split(';')
        let codecs = []
        if (codecStr && codecStr.includes('codecs="')) {
            codecs = codecStr
                .trim()
                .replace(`codecs="`, '')
                .replace(`"`, '')
                .trim()
                .split(',')
                .filter(x => !!x)
                .map(x => x.trim())
        }
        return {
            mime,
            codecStr,
            codecs
        }
    }

    const canPlayType = {
        // Intercept certain requests
        apply: function (target, ctx, args) {
            if (!args || !args.length) {
                return target.apply(ctx, args)
            }
            const {
                mime,
                codecs
            } = parseInput(args[0])
            // This specific mp4 codec is missing in Chromium
            if (mime === 'video/mp4') {
                if (codecs.includes('avc1.42E01E')) {
                    return 'probably'
                }
            }
            // This mimetype is only supported if no codecs are specified
            if (mime === 'audio/x-m4a' && !codecs.length) {
                return 'maybe'
            }

            // This mimetype is only supported if no codecs are specified
            if (mime === 'audio/aac' && !codecs.length) {
                return 'probably'
            }
            // Everything else as usual
            return target.apply(ctx, args)
        }
    }

    /* global HTMLMediaElement */
    utils.replaceWithProxy(
        HTMLMediaElement.prototype,
        'canPlayType',
        canPlayType
    )
} catch (err) {
    err.length != undefined && err.length > 0 ? console.log(err) : null
}
// settings.deviceMemory
try {
    if(settings.deviceMemory) {
        utils.setPropOfProt(window.navigator, 'deviceMemory', settings.deviceMemory)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    const tabHostname = settings['x-hdy-main-frame-host']

    window.addEventListener('storage', event => {
        if(event.key && !event.key.endsWith('|' + tabHostname)) {
            event.stopImmediatePropagation()
        }
    })
    
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.oscpu

// 'OS/2 Warp 3',
// 'OS/2 Warp 4',
// 'OS/2 Warp 4.5',
// 'WindowsCE 1.0',
// 'WindowsCE 2.0',
// 'WindowsCE 3.0',
// 'WindowsCE 4.1',
// 'WindowsCE 4.2',
// 'WindowsCE 4.3',
// 'WindowsCE 4.4',
// 'WindowsCE 4.5',
// 'WindowsCE 5.0',
// 'WindowsCE 6.1',
// 'WindowsCE 6.2',
// 'WindowsCE 6.3',
// 'WindowsCE 6.4',
// 'WindowsCE 6.5',
// 'Windows NT 3.1',
// 'Windows NT 3.5',
// 'Windows NT 3.51',
// 'Windows NT 4.0',
// 'Windows NT 5.0',
// 'Windows NT 5.1',
// 'Windows NT 5.2',
// 'Windows NT 6.0',
// 'Windows NT 6.1',
// 'Windows NT 6.2',
// 'Windows NT 6.3',
// 'Windows NT 10',
// 'Win64',
// 'x64',
// 'WOW64',
// 'PowerPC Mac OS X version',
// 'Linux i686',
// 'Linux x86_64',

try {
    if(settings.oscpu != undefined) {
        utils.setPropOfProt(window.navigator, 'oscpu', settings.oscpu)
        utils.setPropOfProt(window.navigator, 'cpuClass', settings.oscpu)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.platform

// 'Android',
// 'Linux',
// 'null',
// 'iPhone',
// 'iPod',
// 'iPad',
// 'iPhone Simulator',
// 'iPod Simulator',
// 'iPad Simulator',
// 'Macintosh',
// 'MacIntel',
// 'MacPPC',
// 'Mac68K',
// 'Pike v7.6 release 92',
// 'Pike v7.8 release 517',
// 'BlackBerry',
// 'FreeBSD',
// 'FreeBSD i386',
// 'FreeBSD amd64',
// 'Linux aarch64',
// 'Linux armv5tejl',
// 'Linux armv6l',
// 'Linux armv7l',
// 'Linux armv8l',
// 'Linux i686',
// 'Linux i686 on x86_64',
// 'Linux i686 X11',
// 'Linux MSM8960_v3.2.1.1_N_R069_Rev:18',
// 'Linux ppc64',
// 'Linux x86_64',
// 'Linux x86_64 X11',
// 'OS/2',
// 'Pocket PC',
// 'Windows',
// 'Win16',
// 'Win32',
// 'WinCE',
// '',
// 'New Nintendo 3DS',
// 'Nintendo DSi',
// 'Nintendo 3DS',
// 'Nintendo Wii',
// 'Nintendo WiiU',
// 'OpenBSD amd64',
// 'Nokia_Series_40',
// 'S60',
// 'Symbian',
// 'Symbian OS',
// 'PalmOS',
// 'webOS',
// 'SunOS',
// 'SunOS i86pc',
// 'SunOS sun4u',
// 'PLAYSTATION 3',
// 'PlayStation 4',
// 'PSP',
// 'HP-UX',
// 'masking-agent',
// 'WebTV OS',
// 'X11',

try {
    if(settings.platform != undefined) {
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(window.navigator),
            'platform',
            utils.makeHandler().getterValue(Object.freeze(settings.platform))
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.plugins

try {
    if(settings.plugins) {
        const data = settings.plugins

        const mimeTypes = utils.generateMimeTypeArray(data.mimeTypes)
        const plugins = utils.generatePluginArray(data.plugins)

        // Plugin and MimeType cross-reference each other, let's do that now
        // Note: We're looping through `data.plugins` here, not the generated `plugins`
        for (const pluginData of data.plugins) {
            pluginData.__mimeTypes.forEach((type, index) => {
                plugins[pluginData.name][index] = mimeTypes[type]

                Object.defineProperty(plugins[pluginData.name], type, {
                    value: mimeTypes[type],
                    writable: false,
                    enumerable: false, // Not enumerable
                    configurable: true
                })
                Object.defineProperty(mimeTypes[type], 'enabledPlugin', {
                    value: type === 'application/x-pnacl' ?
                        mimeTypes['application/x-nacl'].enabledPlugin // these reference the same plugin, so we need to re-use the Proxy in order to avoid leaks
                        :
                        new Proxy(plugins[pluginData.name], {}), // Prevent circular references
                    writable: false,
                    enumerable: false, // Important: `JSON.stringify(navigator.plugins)`
                    configurable: true
                })
            })
        }

        const patchNavigator = (name, value) => utils.replaceProperty(Object.getPrototypeOf(navigator), name, {
            get() {
                return value
            }
        })

        patchNavigator('mimeTypes', mimeTypes)
        patchNavigator('plugins', plugins)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.screen = {
//     width: Number,
//     height: Number,
// }

try {
    if(settings.screen) {
        utils.setPropOfProt(window.screen, 'width', settings.screen.width)
        utils.setPropOfProt(window.screen, 'height', settings.screen.height)

        let availOffset = Math.floor(settings.random * 100) + 10

        utils.setPropOfProt(window.screen, 'availWidth', settings.screen.width + availOffset)
        utils.setPropOfProt(window.screen, 'availHeight', settings.screen.height + availOffset)

        let colorDepth = window.screen.colorDepth + (Math.floor(settings.random * 10) - 5) + 1
        utils.setPropOfProt(window.screen, 'colorDepth', colorDepth)

        let pixelDepth = window.screen.pixelDepth + (Math.floor(settings.random * 10) - 5) + 1
        utils.setPropOfProt(window.screen, 'pixelDepth', pixelDepth)

        let availLeft = (Number(window.screen.availLeft) || 0) + Math.floor(settings.random * 100)
        let availTop = (Number(window.screen.availTop) || 0) + Math.floor(settings.random * 100)
        utils.setPropOfProt(window.screen, 'availLeft', availLeft)
        utils.setPropOfProt(window.screen, 'availTop', availTop)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
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
// settings.timezone
// interface ResolvedDateTimeFormatOptions {
//     locale: string;
//     calendar: string;
//     numberingSystem: string;
//     timeZone: string;
//     hour12?: boolean;
//     weekday?: string;
//     era?: string;
//     year?: string;
//     month?: string;
//     day?: string;
//     hour?: string;
//     minute?: string;
//     second?: string;
//     timeZoneName?: string;
// }

try {
    if(settings.timezone && Object.keys(settings.timezone).length > 0) {
        const resolvedOptionsProxyHandler = {
            apply: function () {
                return settings.timezone
            }
        }

        utils.replaceWithProxy(window.Intl.DateTimeFormat.prototype, 'resolvedOptions', resolvedOptionsProxyHandler)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.spoofTouch

try {
    if(settings.spoofTouch == true) {
        if(window.navigator.maxTouchPoints !== undefined) {
            utils.setPropOfProt(window.navigator, 'maxTouchPoints', undefined)
        }
        else {
            let a = Math.floor(settings.random * 4) + 1
            utils.setPropOfProt(window.navigator, 'maxTouchPoints', a)
        }
        
        if(window.navigator.msMaxTouchPoints !== undefined) {
            utils.setPropOfProt(window.navigator, 'msMaxTouchPoints', undefined)
        }
        else {
            let a = Math.floor(settings.random * 4) + 1
            utils.setPropOfProt(window.navigator, 'msMaxTouchPoints', a)
        }
        
        if('ontouchstart' in window) {
            utils.setPropOfProt(window, 'ontouchstart', null)
        }
        else {
            window.ontouchstart = (_this, event) => {}
        }
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.locale: Intl.Locale

try {
    if(settings.locale) {
        settings.locale = new Intl.Locale(settings.locale)
        
        // toLocaleString spoof
        {
            // global
            utils.redefineFunctionOfObject(
                window, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString(settings.locale, options)
                    }
                }
            )

            // number 
            utils.redefineFunctionOfObjectProto(
                window.Number.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )

            // string 
            utils.redefineFunctionOfObjectProto(
                window.String.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
            
            // date
            utils.redefineFunctionOfObjectProto(
                window.Date.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )

            // object
            utils.redefineFunctionOfObjectProto(
                window.Object.prototype, 'toLocaleString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
        }

        // toLocaleLowerCase spoof
        {
            // string 
            utils.redefineFunctionOfObjectProto(
                window.String.prototype, 'toLocaleLowerCase', _toLocaleString => {
                    return function() {
                        return _toLocaleString.bind(this)(settings.locale)
                    }
                }
            )
        }

        // toLocaleUpperCase spoof
        {
            // string 
            utils.redefineFunctionOfObjectProto(
                window.String.prototype, 'toLocaleUpperCase', _toLocaleString => {
                    return function() {
                        return _toLocaleString.bind(this)(settings.locale)
                    }
                }
            )
        }

        // toLocaleTimeString spoof
        {
            // date
            utils.redefineFunctionOfObjectProto(
                window.Date.prototype, 'toLocaleTimeString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
        }

        // toLocaleDateString spoof
        {
            // date
            utils.redefineFunctionOfObjectProto(
                window.Date.prototype, 'toLocaleDateString', _toLocaleString => {
                    return function(_, options) {
                        return _toLocaleString.bind(this)(settings.locale, options)
                    }
                }
            )
        }
        
        // Intl.DateTimeFormat spoof
        let old_DateTimeFormat = window.Intl.DateTimeFormat
        utils.setPropOfProt(window.Intl, 'DateTimeFormat', function DateTimeFormat(...args) {
            return new old_DateTimeFormat(settings.locale)
        })

        // Intl.NumberFormat
        let old_NumberFormat = window.Intl.NumberFormat
        utils.setPropOfProt(window.Intl, 'NumberFormat', function NumberFormat(...args) {
            return new old_NumberFormat(settings.locale)
        })

        // Intl.Segmenter
        let old_Segmenter = window.Intl.Segmenter
        utils.setPropOfProt(window.Intl, 'Segmenter', function Segmenter(...args) {
            return new old_Segmenter(settings.locale)
        })

        // Intl.Collator
        let old_Collator = window.Intl.Collator
        utils.setPropOfProt(window.Intl, 'Collator', function Collator(...args) {
            return new old_Collator(settings.locale)
        })

        // Intl.DisplayNames
        let old_DisplayNames = window.Intl.DisplayNames
        utils.setPropOfProt(window.Intl, 'DisplayNames', function DisplayNames(...args) {
            return new old_DisplayNames(settings.locale)
        })

        // Intl.ListFormat
        let old_ListFormat = window.Intl.ListFormat
        utils.setPropOfProt(window.Intl, 'ListFormat', function ListFormat(...args) {
            return new old_ListFormat(settings.locale)
        })

        // Intl.PluralRules
        let old_PluralRules = window.Intl.PluralRules
        utils.setPropOfProt(window.Intl, 'PluralRules', function PluralRules(...args) {
            return new old_PluralRules(settings.locale)
        })

        // Intl.RelativeTimeFormat
        let old_RelativeTimeFormat = window.Intl.RelativeTimeFormat
        utils.setPropOfProt(window.Intl, 'RelativeTimeFormat', function RelativeTimeFormat(...args) {
            return new old_RelativeTimeFormat(settings.locale)
        })
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.userAgent

try {
    if(settings.userAgent != undefined) {
        var userAgent = settings.userAgent
        var appVersion = userAgent.slice(userAgent.indexOf('/') + 1)
        utils.setPropOfProt(window.navigator, 'userAgent', userAgent)
        utils.setPropOfProt(window.navigator, 'appVersion', appVersion)
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.flavor

// 'chrome'
// 'safari'
// '__crWeb'
// '__gCrWeb'
// 'yandex'
// '__yb'
// '__ybro'
// '__firefox__'
// '__edgeTrackingPreventionStatistics'
// 'webkit'
// 'oprt'
// 'samsungAr'
// 'ucweb'
// 'UCShellJava'
// 'puffinDevice'

try {
    let flavors = [
        'chrome', 'safari',
        '__crWeb', '__gCrWeb',
        'yandex', '__yb',
        '__ybro', '__firefox__',
        '__edgeTrackingPreventionStatistics',
        'webkit', 'oprt',
        'samsungAr', 'ucweb',
        'UCShellJava', 'puffinDevice'
    ]

    // delete current flavor
    for(let flavor of flavors) {
        if(window[flavor]) {
            delete window[flavor]
            window[flavor] = undefined
            break
        }
    }

    window[settings.flavor] = getFlavorObject()

    function getFlavorObject() {
        switch(settings.flavor) {
            case 'chrome':
                return {
                    // todo
                }
            default: {
                return {}
            }
        }
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.vendor

// chrome: 'Google Inc.'
// safari: 'Apple Computer, Inc.'
// firefox: ''

try {
    if(settings.vendor != undefined) {
        utils.replaceGetterWithProxy(
            Object.getPrototypeOf(window.navigator),
            'vendor',
            utils.makeHandler().getterValue(Object.freeze(settings.vendor))
        )
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    if (navigator.webdriver === false) {
        // Post Chrome 89.0.4339.0 and already good
    } else if (navigator.webdriver === undefined) {
        // Pre Chrome 89.0.4339.0 and already good
    } else {
        // Pre Chrome 88.0.4291.0 and needs patching
        delete Object.getPrototypeOf(navigator).webdriver
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// settings.webGL {
//  vendor: '',
//  renderer: ''
// }

try {
    if(settings.webGL) {
        const getParameterProxyHandler = {
            apply: function (target, ctx, args) {
                const param = (args || [])[0]
                const result = utils.cache.Reflect.apply(target, ctx, args)
                // UNMASKED_VENDOR_WEBGL
                if (param === 37445) {
                    return settings.webGL.vendor
                }
                // UNMASKED_RENDERER_WEBGL
                if (param === 37446) {
                    return settings.webGL.renderer
                }
                return result
            }
        }

        // There's more than one WebGL rendering context
        // https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext#Browser_compatibility
        // To find out the original values here: Object.getOwnPropertyDescriptors(WebGLRenderingContext.prototype.getParameter)
        const addProxy = (obj, propName) => {
            utils.replaceWithProxy(obj, propName, getParameterProxyHandler)
        }
        // For whatever weird reason loops don't play nice with Object.defineProperty, here's the next best thing:
        addProxy(WebGLRenderingContext.prototype, 'getParameter')
        addProxy(WebGL2RenderingContext.prototype, 'getParameter')
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
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
try {
    if (!window.chrome) {
        // Use the exact property descriptor found in headful Chrome
        // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
        Object.defineProperty(window, 'chrome', {
            writable: true,
            enumerable: true,
            configurable: false, // note!
            value: {} // We'll extend that later
        })
    }
    
    // That means we're running headful and don't need to mock anything
    if ('app' in window.chrome) {
        throw '' // Nothing to do here
    }
    
    const makeError = {
        ErrorInInvocation: fn => {
            const err = new TypeError(`Error in invocation of app.${fn}()`)
            return utils.stripErrorWithAnchor(
                err,
                `at ${fn} (eval at <anonymous>`
            )
        }
    }
    
    // There's a some static data in that property which doesn't seem to change,
    // we should periodically check for updates: `JSON.stringify(window.app, null, 2)`
    const STATIC_DATA = JSON.parse(
        `
    {
     "isInstalled": false,
     "InstallState": {
     "DISABLED": "disabled",
     "INSTALLED": "installed",
     "NOT_INSTALLED": "not_installed"
     },
     "RunningState": {
     "CANNOT_RUN": "cannot_run",
     "READY_TO_RUN": "ready_to_run",
     "RUNNING": "running"
     }
    }
             `.trim()
    )
    
    window.chrome.app = {
        ...STATIC_DATA,
    
        get isInstalled() {
            return false
        },
    
        getDetails: function getDetails() {
            if (arguments.length) {
                throw makeError.ErrorInInvocation(`getDetails`)
            }
            return null
        },
        getIsInstalled: function getDetails() {
            if (arguments.length) {
                throw makeError.ErrorInInvocation(`getIsInstalled`)
            }
            return false
        },
        runningState: function getDetails() {
            if (arguments.length) {
                throw makeError.ErrorInInvocation(`runningState`)
            }
            return 'cannot_run'
        }
    }
    utils.patchToStringNested(window.chrome.app)
} catch (err){
    err.length != undefined && err.length > 0 ? console.log(err) : null
}
try {
    if (!window.chrome) {
        // Use the exact property descriptor found in headful Chrome
        // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
        Object.defineProperty(window, 'chrome', {
            writable: true,
            enumerable: true,
            configurable: false, // note!
            value: {} // We'll extend that later
        })
    }

    // That means we're running headful and don't need to mock anything
    if ('csi' in window.chrome) {
        throw '' // Nothing to do here
    }

    // Check that the Navigation Timing API v1 is available, we need that
    if (!window.performance || !window.performance.timing) {
        throw ''
    }

    const {
        timing
    } = window.performance

    window.chrome.csi = function () {
        return {
            onloadT: timing.domContentLoadedEventEnd,
            startE: timing.navigationStart,
            pageT: Date.now() - timing.navigationStart,
            tran: 15 // Transition type or something
        }
    }
    utils.patchToString(window.chrome.csi)
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    if (!window.chrome) {
        // Use the exact property descriptor found in headful Chrome
        // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
        Object.defineProperty(window, 'chrome', {
            writable: true,
            enumerable: true,
            configurable: false, // note!
            value: {} // We'll extend that later
        })
    }

    // That means we're running headful and don't need to mock anything
    if ('loadTimes' in window.chrome) {
        throw '' // Nothing to do here
    }

    // Check that the Navigation Timing API v1 + v2 is available, we need that
    if (
        !window.performance ||
        !window.performance.timing ||
        !window.PerformancePaintTiming
    ) {
        throw ''
    }

    const {
        performance
    } = window

    // Some stuff is not available on about:blank as it requires a navigation to occur,
    // let's harden the code to not fail then:
    const ntEntryFallback = {
        nextHopProtocol: 'h2',
        type: 'other'
    }

    // The API exposes some funky info regarding the connection
    const protocolInfo = {
        get connectionInfo() {
            const ntEntry =
                performance.getEntriesByType('navigation')[0] || ntEntryFallback
            return ntEntry.nextHopProtocol
        },
        get npnNegotiatedProtocol() {
            // NPN is deprecated in favor of ALPN, but this implementation returns the
            // HTTP/2 or HTTP2+QUIC/39 requests negotiated via ALPN.
            const ntEntry =
                performance.getEntriesByType('navigation')[0] || ntEntryFallback
            return ['h2', 'hq'].includes(ntEntry.nextHopProtocol) ?
                ntEntry.nextHopProtocol :
                'unknown'
        },
        get navigationType() {
            const ntEntry =
                performance.getEntriesByType('navigation')[0] || ntEntryFallback
            return ntEntry.type
        },
        get wasAlternateProtocolAvailable() {
            // The Alternate-Protocol header is deprecated in favor of Alt-Svc
            // (https://www.mnot.net/blog/2016/03/09/alt-svc), so technically this
            // should always return false.
            return false
        },
        get wasFetchedViaSpdy() {
            // SPDY is deprecated in favor of HTTP/2, but this implementation returns
            // true for HTTP/2 or HTTP2+QUIC/39 as well.
            const ntEntry =
                performance.getEntriesByType('navigation')[0] || ntEntryFallback
            return ['h2', 'hq'].includes(ntEntry.nextHopProtocol)
        },
        get wasNpnNegotiated() {
            // NPN is deprecated in favor of ALPN, but this implementation returns true
            // for HTTP/2 or HTTP2+QUIC/39 requests negotiated via ALPN.
            const ntEntry =
                performance.getEntriesByType('navigation')[0] || ntEntryFallback
            return ['h2', 'hq'].includes(ntEntry.nextHopProtocol)
        }
    }

    const {
        timing
    } = window.performance

    // Truncate number to specific number of decimals, most of the `loadTimes` stuff has 3
    function toFixed(num, fixed) {
        var re = new RegExp('^-?\\d+(?:.\\d{0,' + (fixed || -1) + '})?')
        return num.toString().match(re)[0]
    }

    const timingInfo = {
        get firstPaintAfterLoadTime() {
            // This was never actually implemented and always returns 0.
            return 0
        },
        get requestTime() {
            return timing.navigationStart / 1000
        },
        get startLoadTime() {
            return timing.navigationStart / 1000
        },
        get commitLoadTime() {
            return timing.responseStart / 1000
        },
        get finishDocumentLoadTime() {
            return timing.domContentLoadedEventEnd / 1000
        },
        get finishLoadTime() {
            return timing.loadEventEnd / 1000
        },
        get firstPaintTime() {
            const fpEntry = performance.getEntriesByType('paint')[0] || {
                startTime: timing.loadEventEnd / 1000 // Fallback if no navigation occured (`about:blank`)
            }
            return toFixed(
                (fpEntry.startTime + performance.timeOrigin) / 1000,
                3
            )
        }
    }

    window.chrome.loadTimes = function () {
        return {
            ...protocolInfo,
            ...timingInfo
        }
    }
    utils.patchToString(window.chrome.loadTimes)
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
try {
    if (!window.chrome) {
        // Use the exact property descriptor found in headful Chrome
        // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
        Object.defineProperty(window, 'chrome', {
            writable: true,
            enumerable: true,
            configurable: false, // note!
            value: {} // We'll extend that later
        })
    }

    // That means we're running headful and don't need to mock anything
    const existsAlready = 'runtime' in window.chrome
    // `chrome.runtime` is only exposed on secure origins
    if (existsAlready) throw 'asd'

    const STATIC_DATA = JSON.parse(`
 {
     "OnInstalledReason": {
         "CHROME_UPDATE": "chrome_update",
         "INSTALL": "install",
         "SHARED_MODULE_UPDATE": "shared_module_update",
         "UPDATE": "update"
     },
     "OnRestartRequiredReason": {
         "APP_UPDATE": "app_update",
         "OS_UPDATE": "os_update",
         "PERIODIC": "periodic"
     },
     "PlatformArch": {
         "ARM": "arm",
         "ARM64": "arm64",
         "MIPS": "mips",
         "MIPS64": "mips64",
         "X86_32": "x86-32",
         "X86_64": "x86-64"
     },
     "PlatformNaclArch": {
         "ARM": "arm",
         "MIPS": "mips",
         "MIPS64": "mips64",
         "X86_32": "x86-32",
         "X86_64": "x86-64"
     },
     "PlatformOs": {
         "ANDROID": "android",
         "CROS": "cros",
         "LINUX": "linux",
         "MAC": "mac",
         "OPENBSD": "openbsd",
         "WIN": "win"
     },
     "RequestUpdateCheckStatus": {
         "NO_UPDATE": "no_update",
         "THROTTLED": "throttled",
         "UPDATE_AVAILABLE": "update_available"
     }
 }
             `.trim());

    window.chrome.runtime = {
        // There's a bunch of static data in that property which doesn't seem to change,
        // we should periodically check for updates: `JSON.stringify(window.chrome.runtime, null, 2)`
        ...STATIC_DATA,
        // `chrome.runtime.id` is extension related and returns undefined in Chrome
        get id() {
            return undefined
        },
        // These two require more sophisticated mocks
        connect: null,
        sendMessage: null
    }

    const makeCustomRuntimeErrors = (preamble, method, extensionId) => ({
        NoMatchingSignature: new TypeError(
            preamble + `No matching signature.`
        ),
        MustSpecifyExtensionID: new TypeError(
            preamble +
            `${method} called from a webpage must specify an Extension ID (string) for its first argument.`
        ),
        InvalidExtensionID: new TypeError(
            preamble + `Invalid extension id: '${extensionId}'`
        )
    })

    // Valid Extension IDs are 32 characters in length and use the letter `a` to `p`:
    // https://source.chromium.org/chromium/chromium/src/+/master:components/crx_file/id_util.cc;drc=14a055ccb17e8c8d5d437fe080faba4c6f07beac;l=90
    const isValidExtensionID = str =>
        str.length === 32 && str.toLowerCase().match(/^[a-p]+$/)

    /** Mock `chrome.runtime.sendMessage` */
    const sendMessageHandler = {
        apply: function (target, ctx, args) {
            const [extensionId, options, responseCallback] = args || []

            // Define custom errors
            const errorPreamble = `Error in invocation of runtime.sendMessage(optional string extensionId, any message, optional object options, optional function responseCallback): `
            const Errors = makeCustomRuntimeErrors(
                errorPreamble,
                `chrome.runtime.sendMessage()`,
                extensionId
            )

            // Check if the call signature looks ok
            const noArguments = args.length === 0
            const tooManyArguments = args.length > 4
            const incorrectOptions = options && typeof options !== 'object'
            const incorrectResponseCallback =
                responseCallback && typeof responseCallback !== 'function'
            if (
                noArguments ||
                tooManyArguments ||
                incorrectOptions ||
                incorrectResponseCallback
            ) {
                throw Errors.NoMatchingSignature
            }

            // At least 2 arguments are required before we even validate the extension ID
            if (args.length < 2) {
                throw Errors.MustSpecifyExtensionID
            }

            // Now let's make sure we got a string as extension ID
            if (typeof extensionId !== 'string') {
                throw Errors.NoMatchingSignature
            }

            if (!isValidExtensionID(extensionId)) {
                throw Errors.InvalidExtensionID
            }

            return undefined // Normal behavior
        }
    }
    utils.mockWithProxy(
        window.chrome.runtime,
        'sendMessage',
        function sendMessage() {},
        sendMessageHandler
    )

    /**
     * Mock `chrome.runtime.connect`
     *
     * @see https://developer.chrome.com/apps/runtime#method-connect
     */
    const connectHandler = {
        apply: function (target, ctx, args) {
            const [extensionId, connectInfo] = args || []

            // Define custom errors
            const errorPreamble = `Error in invocation of runtime.connect(optional string extensionId, optional object connectInfo): `
            const Errors = makeCustomRuntimeErrors(
                errorPreamble,
                `chrome.runtime.connect()`,
                extensionId
            )

            // Behavior differs a bit from sendMessage:
            const noArguments = args.length === 0
            const emptyStringArgument = args.length === 1 && extensionId === ''
            if (noArguments || emptyStringArgument) {
                throw Errors.MustSpecifyExtensionID
            }

            const tooManyArguments = args.length > 2
            const incorrectConnectInfoType =
                connectInfo && typeof connectInfo !== 'object'

            if (tooManyArguments || incorrectConnectInfoType) {
                throw Errors.NoMatchingSignature
            }

            const extensionIdIsString = typeof extensionId === 'string'
            if (extensionIdIsString && extensionId === '') {
                throw Errors.MustSpecifyExtensionID
            }
            if (extensionIdIsString && !isValidExtensionID(extensionId)) {
                throw Errors.InvalidExtensionID
            }

            // There's another edge-case here: extensionId is optional so we might find a connectInfo object as first param, which we need to validate
            const validateConnectInfo = ci => {
                // More than a first param connectInfo as been provided
                if (args.length > 1) {
                    throw Errors.NoMatchingSignature
                }
                // An empty connectInfo has been provided
                if (Object.keys(ci).length === 0) {
                    throw Errors.MustSpecifyExtensionID
                }
                // Loop over all connectInfo props an check them
                Object.entries(ci).forEach(([k, v]) => {
                    const isExpected = ['name', 'includeTlsChannelId'].includes(k)
                    if (!isExpected) {
                        throw new TypeError(
                            errorPreamble + `Unexpected property: '${k}'.`
                        )
                    }
                    const MismatchError = (propName, expected, found) =>
                        TypeError(
                            errorPreamble +
                            `Error at property '${propName}': Invalid type: expected ${expected}, found ${found}.`
                        )
                    if (k === 'name' && typeof v !== 'string') {
                        throw MismatchError(k, 'string', typeof v)
                    }
                    if (k === 'includeTlsChannelId' && typeof v !== 'boolean') {
                        throw MismatchError(k, 'boolean', typeof v)
                    }
                })
            }
            if (typeof extensionId === 'object') {
                validateConnectInfo(extensionId)
                throw Errors.MustSpecifyExtensionID
            }

            // Unfortunately even when the connect fails Chrome will return an object with methods we need to mock as well
            return utils.patchToStringNested(makeConnectResponse())
        }
    }
    utils.mockWithProxy(
        window.chrome.runtime,
        'connect',
        function connect() {},
        connectHandler
    )

    function makeConnectResponse() {
        const onSomething = () => ({
            addListener: function addListener() {},
            dispatch: function dispatch() {},
            hasListener: function hasListener() {},
            hasListeners: function hasListeners() {
                return false
            },
            removeListener: function removeListener() {}
        })

        const response = {
            name: '',
            sender: undefined,
            disconnect: function disconnect() {},
            onDisconnect: onSomething(),
            onMessage: onSomething(),
            postMessage: function postMessage() {
                if (!arguments.length) {
                    throw new TypeError(`Insufficient number of arguments.`)
                }
                throw new Error(`Attempting to use a disconnected port object`)
            }
        }
        return response
    }
} catch (err) { err.length != undefined && err.length > 0 ? console.log(err) : null }
// this only hides hoody errors from the try catches
// doesn't hide global errors
// console.clear()
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

    // if(window.location.href.startsWith('data:') || window.location.href.startsWith('blob:')) {
    //     Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
    //         configurable: true,
    
    //         get: function () {
    //             const old = contentWindowDescriptor.get.call(this)
    //             const is_srcDoc = this.srcdoc !== undefined && this.srcdoc.trim().length > 0 === true
    
    //             if(is_srcDoc) {
    //                 Object.defineProperty(old.document, 'body', {
    //                     configurable: true, 
    //                     get: function() {
    //                         return document.createElement('body')
    //                     }
    //                 })
    //             }
    
    //             return old
    //         }
    //     })
    // }
    // else {
    //     Object.defineProperty(window.HTMLIFrameElement.prototype, 'contentWindow', {
    //         configurable: true,
    
    //         get: function () {
    //             const old = contentWindowDescriptor.get.call(this)
    //             const is_srcDoc = this.srcdoc !== undefined && this.srcdoc.trim().length > 0 === true
    
    //             if(is_srcDoc) {
    //                 // // the browser is going to change that to "completed" once the content script reloads the page
    //                 // // and the payload is going to be executed
    //                 // Object.defineProperty(old.document, 'readyState', {
    //                 //     configurable: true, 
    //                 //     get: function() {
    //                 //         return 'loading'
    //                 //     }
    //                 // })


    
    //                 return old
    //             }
    
    //             return old
    //         }
    //     })
    // }

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
// remove the script from the page

try {
    Array.from(window.document.getElementsByClassName('hoody-protect'))
    .map(x => x.remove())
} catch (err) { console.log(err) }

// inform the page hoody protected you
// this is deleted from the inline script that comes with the payload
window.hoodyProtectedThisPage = true}