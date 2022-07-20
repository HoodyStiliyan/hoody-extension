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