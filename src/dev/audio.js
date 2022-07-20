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