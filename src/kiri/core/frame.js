/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { load } from '../../load/file.js';
import { newWidget } from './widget.js';
import { VIEWS } from './consts.js';

// add frame message api listener
window.addEventListener('message', msg => {
    const { conf, event, feature, platform, settings, show } = api;

    if (!feature.frame) return;

    const { origin, source, target, data } = msg;

    if (source.window === target.window) return;

    const send = source.window.postMessage;

    if (data.mode) {
        api.mode.set(data.mode.toUpperCase());
    }

    if (data.view) {
        api.view.set(VIEWS[data.view.toUpperCase()]);
    }

    if (data.function) {
        const cb = data.callback ? (output) => {
            send({event:`${data.function}.done`, data: output});
        } : undefined;
        api.function[data.function.toLowerCase()](cb);
    }

    if (data.event) {
        event.on(data.event, (evd) => {
            send({event: data.event, data: evd});
        });
    }

    if (data.emit) {
        event.emit(data.emit, data.message)
    }

    if (data.get) switch (data.get) {
        case "mode": send({mode: settings.mode()}); break;
        case "device": send({device: settings.dev()}); break;
        case "process": send({process: settings.proc()}); break;
        default: send({all: settings}); break;

    }

    if (data.features) {
        Object.assign(feature, data.features);
        api.show.controls(api.feature.controls);
    }

    if (data.device) {
        Object.assign(settings.dev(), data.device);
        conf.save();
    }

    if (data.process){
        Object.assign(settings.proc(), data.process);
        conf.save();
    }

    if (data.controller){
        let ctrl = settings.ctrl();
        Object.assign(ctrl, data.controller);
        api.event.emit("set.threaded", ctrl.threaded);
        conf.save();
    }

    if (data.parse) {
        let bin = data.parse;
        let widget;
        switch ((data.type || 'stl').toLowerCase()) {
            case 'stl':
                if (!bin.buffer) bin = new Float32Array(bin).buffer;
                new load.STL().parse(bin, vertices => {
                    widget = newWidget().loadVertices(vertices);
                    widget.meta.auto_orient = true;
                    widget.meta.force_layout = true;
                    platform.add(widget);
                    send({event: "parsed", data: [ widget.id ]});
                });
                break;
            case 'obj':
                // todo
                break;
            case '3mf':
                // todo
                break;
            case 'svg':
                let wid = [];
                for (let svg of load.SVG.parse(bin)) {
                    if (!(svg && svg.length)) continue;
                    widget = newWidget().loadVertices(svg.toFloat32());
                    widget.meta.auto_orient = true;
                    widget.meta.force_layout = true;
                    platform.add(widget);
                    wid.push(widget.id);
                }
                send({event: "parsed", data: wid});
                break;
        }
    }

    if (data.load) {
        platform.load(data.load, (verts, widget) => {
            send({event: "loaded", data: [ widget.id ]});
        })
    };

    if (data.clear) {
        platform.clear();
    }

    if (data.alert) {
        show.alert(data.alert, data.time);
    }

    if (data.progress >= 0) {
        show.progress(data.progress, data.message);
    }
});
