/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';

let LANG = api.language.current;
let { FDM } = api.const.MODES,
    { $ } = api.web,
    { uc, ui } = api,
    { bound, toInt, toFloat } = uc,
    { newBlank, newButton, newBoolean, newGroup, newInput, newSelect, newRow } = uc,
    driven = true,
    hideable = true,
    separator = true,
    trigger = true
    ;

function onBooleanClick(el) {
    api.event.emit('click.boolean', el);
}

function onButtonClick(el) {
    api.event.emit('click.button', el);
}

function thinWallSave() {
    let opt = ui.sliceDetectThin;
    let level = opt.options[opt.selectedIndex];
    if (level) {
        api.conf.get().process.sliceDetectThin = level.value;
        api.conf.save();
    }
}

function isMultiHead() {
    let dev = api.conf.get().device;
    return isNotBelt() && dev.extruders && dev.extruders.length > 1;
}

function optSelected(sel) {
    let opt = sel.options[sel.selectedIndex];
    return opt ? opt.value : undefined;
}

function hasInfill() {
    return optSelected(ui.sliceFillType) !== 'none'
}

function fillIsLinear() {
    return hasInfill() && optSelected(ui.sliceFillType) === 'linear';
}

function zIntShow() {
    return settings().controller.devel;
}

function isBelt() {
    return api.device.isBelt();
}

function isNotBelt() {
    return !isBelt();
}

export function menu() {

    return {

    /** Left Side Menu - Simplified version with only key settings */

    _____:               newGroup("Key Settings", $('fdm-key-settings'), { modes:FDM, driven, hideable, separator, group:"fdm-key-settings" }),
    // Wall settings
    sliceShells:         newInput(LANG.sl_shel_s, { title:LANG.sl_shel_l, convert:toFloat }),
    sliceLineWidth:      newInput(LANG.sl_line_s, { title:LANG.sl_line_l, convert:toFloat, bound:bound(0,5) }),

    separator:           newBlank({ class:"set-sep", driven }),

    // Infill settings
    sliceFillType:       newSelect(LANG.fi_type, {trigger}, "infill"),
    sliceFillSparse:     newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:toFloat, bound:bound(0.0,1.0), show:hasInfill}),
    sliceFillAngle:      newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:toFloat}),

    separator:           newBlank({ class:"set-sep", driven }),

    // Support settings
    sliceSupportEnable:  newBoolean(LANG.sp_auto_s, onBooleanClick, {title:LANG.sp_auto_l, show:isNotBelt}),
    sliceSupportDensity: newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:toFloat, bound:bound(0.0,1.0)}),
    sliceSupportAngle:   newInput(LANG.sp_angl_s, {title:LANG.sp_angl_l, convert:toFloat, bound:bound(0.0,90.0)}),

    separator:           newBlank({ class:"set-sep", driven }),

    // Layer height
    sliceHeight:         newInput(LANG.sl_lahi_s, { title:LANG.sl_lahi_l, convert:toFloat }),

    fdmRanges:    $('fdm-ranges'),

    };
}
