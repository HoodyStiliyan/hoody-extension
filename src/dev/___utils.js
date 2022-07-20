console.log('hoody protecc')
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