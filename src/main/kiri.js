/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';
import '../kiri/core/lang.js';
import '../kiri/core/lang-en.js';

import { broker } from '../moto/broker.js';
import { run } from '../kiri/core/init.js';

let traceload = location.search.indexOf('traceload') > 0;
let load = [];

if (traceload) {
    broker.subscribe([
        "init.one",
        "init.two",
        "init.lang",
        "init-done",
        "load-done",
    ], (msg, topic) => {
        console.log(topic, '->', msg);
    })
}

function safeExec(fn) {
    try {
        if (traceload) {
            console.log('kiri | exec |', fn);
        }
        fn(kiri.api);
    } catch (error) {
        console.log('load error', fn, error);
    }
}

function checkReady() {
    if (document.readyState === 'complete') {
        // Safe check for service worker controller
        let bootctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
        console.log(`kiri | boot ctrl | ` + (bootctrl ? true : false));
        let api = kiri.api = run();
        self.$ = api.web.$;
        for (let fn of load) {
            safeExec(fn);
        }
        load = undefined;
        api.event.emit('load-done', stats);
        if (api.electron) {
            $('install').classList.add('hide');
            $('app-quit').classList.remove('hide');
            $('app-name-text').innerText = "More Info";
            $('top-sep').style.display = 'flex';
        } else if (bootctrl) {
            let installEl = $('install');
            let uninstallEl = $('uninstall');
            if (installEl) installEl.classList.add('hide');
            if (uninstallEl) {
                uninstallEl.classList.remove('hide');
                uninstallEl.onclick = () => {
                    bootctrl.postMessage({ clear: true, disable: true });
                    location.reload();
                }
            }
        } else {
            let installEl = $('install');
            if (installEl) {
                installEl.onclick = () => {
                    location.replace('/boot');
                }
            }
        }
    }
}

self.kiri = {
    load(fn) {
        // console.log('KIRI LOAD', [...arguments]);
        if (load) {
            load.push(fn);
        } else {
            safeExec(fn);
        }
    }
};

self.moto = { };

// when dom + scripts complete
document.onreadystatechange = checkReady;

checkReady();

