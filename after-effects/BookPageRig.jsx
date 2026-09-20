// BookPageRig.jsx
//
// Builds a "book flip" rig from a single source layer inside the active comp:
// duplicates it N times, freezes each duplicate on a different source frame,
// and drives every duplicate's stacking depth + turn rotation from one
// "Book Controller" null, so the whole book is animated with a handful of
// sliders instead of per-layer keyframes.
//
// USAGE
//   1. Open the comp and select ONE layer to use as the page source (usually
//      a precomp layer - the "one comp" that holds your page artwork/animation).
//   2. Run this script: File > Scripts > Run Script File... > BookPageRig.jsx
//   3. Fill in the dialog (page count, frame step, spine side, Z gap).
//   4. A "Book Controller" null appears with these Slider/Angle controls:
//        Frame Step   - source frames between each page's held frame
//                        (Page 0 holds frame 0, Page 1 holds frame 1*step, ...)
//        Z Gap        - depth spacing between stacked pages (paper thickness)
//        Page Turn    - 0-100 master turn progress; keyframe this to flip
//                        through the book (front page turns first)
//        Turn Spread  - how much "Page Turn" separates each page's own turn,
//                        so pages flip one after another instead of together
//        Turn Angle   - degrees a page rotates once fully turned (try -180
//                        if pages flip the wrong way for your spine side)
//        Bend Amount  - curls each page via CC Page Turn while it flips, for
//                        the "bending page" look instead of a flat swing
//   5. Scrub or keyframe "Page Turn" on Book Controller (0 -> 100 is added
//      automatically across the comp duration; delete those keys if you'd
//      rather animate it by hand).
//
// All per-page behavior lives in expressions, so tweaking a slider updates
// every page at once - duplicate the source again later and only Frame Step/
// index need wiring up (see setupPage below) to fold a new page into the rig.

(function bookPageRig() {

    app.beginUndoGroup("Create Book Page Rig");

    try {
        var comp = app.project.activeItem;
        if (!(comp && comp instanceof CompItem)) {
            alert("Open a composition first.");
            return;
        }
        if (comp.selectedLayers.length !== 1) {
            alert("Select exactly one layer to use as the page source, then run again.");
            return;
        }

        var sourceLayer = comp.selectedLayers[0];
        var opts = showOptionsDialog(sourceLayer.name);
        if (!opts) return; // user cancelled

        var controller = createController(comp, opts);
        var pages = createPages(comp, sourceLayer, opts.pageCount);

        for (var i = 0; i < pages.length; i++) {
            setupPage(pages[i], i, opts);
        }

        controller.moveToBeginning();

        alert("Book rig created: " + pages.length + " page(s) under \"Book Controller\".");

    } catch (err) {
        alert("Book Page Rig error: " + err.toString() + (err.line ? (" (line " + err.line + ")") : ""));
    } finally {
        app.endUndoGroup();
    }

    // ------------------------------------------------------------------

    function showOptionsDialog(sourceName) {
        var win = new Window("dialog", "Book Page Rig");
        win.orientation = "column";
        win.alignChildren = "fill";

        win.add("statictext", undefined, "Source layer: " + sourceName);

        var grid = win.add("group");
        grid.orientation = "column";
        grid.alignChildren = "left";

        var pageCountRow = grid.add("group");
        pageCountRow.add("statictext", undefined, "Number of pages:").minimumSize = [140, 0];
        var pageCountInput = pageCountRow.add("edittext", undefined, "12");
        pageCountInput.characters = 6;

        var frameStepRow = grid.add("group");
        frameStepRow.add("statictext", undefined, "Frame step:").minimumSize = [140, 0];
        var frameStepInput = frameStepRow.add("edittext", undefined, "1");
        frameStepInput.characters = 6;

        var zGapRow = grid.add("group");
        zGapRow.add("statictext", undefined, "Z gap (per page):").minimumSize = [140, 0];
        var zGapInput = zGapRow.add("edittext", undefined, "4");
        zGapInput.characters = 6;

        var spineRow = grid.add("group");
        spineRow.add("statictext", undefined, "Spine side:").minimumSize = [140, 0];
        var spineDropdown = spineRow.add("dropdownlist", undefined, ["Left", "Right"]);
        spineDropdown.selection = 0;

        var animateCheckbox = grid.add("checkbox", undefined, "Keyframe Page Turn 0 -> 100 across comp");
        animateCheckbox.value = true;

        var buttons = win.add("group");
        buttons.alignment = "right";
        var cancelBtn = buttons.add("button", undefined, "Cancel", { name: "cancel" });
        var okBtn = buttons.add("button", undefined, "Create Rig", { name: "ok" });

        var result = null;

        okBtn.onClick = function () {
            var pageCount = Math.round(Number(pageCountInput.text));
            var frameStep = Math.round(Number(frameStepInput.text));
            var zGap = Number(zGapInput.text);

            if (!(pageCount >= 1)) {
                alert("Number of pages must be at least 1.");
                return;
            }
            if (!(frameStep >= 0)) {
                alert("Frame step must be zero or a positive number.");
                return;
            }
            if (isNaN(zGap)) {
                alert("Z gap must be a number.");
                return;
            }

            result = {
                pageCount: pageCount,
                frameStep: frameStep,
                zGap: zGap,
                spineSide: spineDropdown.selection.text.toLowerCase(),
                animate: animateCheckbox.value
            };
            win.close();
        };
        cancelBtn.onClick = function () { win.close(); };

        win.center();
        win.show();
        return result;
    }

    function createController(comp, opts) {
        var controller = comp.layers.addNull();
        controller.threeDLayer = true;
        controller.name = "Book Controller";

        var sliderFrameStep = addSliderControl(controller, "Frame Step", opts.frameStep);
        var sliderZGap = addSliderControl(controller, "Z Gap", opts.zGap);
        var sliderPageTurn = addSliderControl(controller, "Page Turn", 0);
        var spreadDefault = Math.max(1, Math.round(100 / opts.pageCount));
        var sliderSpread = addSliderControl(controller, "Turn Spread", spreadDefault);
        addAngleControl(controller, "Turn Angle", 180);
        addSliderControl(controller, "Bend Amount", 30);

        if (opts.animate) {
            var turnProp = sliderPageTurn.property(1);
            turnProp.setValueAtTime(0, 0);
            turnProp.setValueAtTime(comp.duration, 100);
        }

        return controller;
    }

    function addSliderControl(layer, name, defaultValue) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property(1).setValue(defaultValue);
        return fx;
    }

    function addAngleControl(layer, name, defaultValue) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Angle Control");
        fx.name = name;
        fx.property(1).setValue(defaultValue);
        return fx;
    }

    function createPages(comp, sourceLayer, pageCount) {
        var pages = [sourceLayer];
        for (var p = 1; p < pageCount; p++) {
            pages.push(sourceLayer.duplicate());
        }

        // duplicate() insertion order is easy to get wrong to reason about,
        // so lay the stack out explicitly: pages[0] on top, each next page
        // directly beneath the previous one.
        pages[0].moveToBeginning();
        for (var i = 1; i < pages.length; i++) {
            pages[i].moveAfter(pages[i - 1]);
        }
        return pages;
    }

    function setupPage(layer, index, opts) {
        layer.name = "Page " + pad(index + 1, opts.pageCount);
        layer.threeDLayer = true;

        freezeOnSourceFrame(layer, index);
        anchorAtSpine(layer, opts.spineSide);
        expressPositionZ(layer, index);
        expressPageTurn(layer, index);
        expressBend(layer, index);
    }

    function freezeOnSourceFrame(layer, index) {
        try {
            layer.timeRemapEnabled = true;
        } catch (e) {
            return; // source has no inherent duration (e.g. a solid/shape) - skip
        }
        var remap = layer.property("ADBE Time Remapping");
        remap.expression =
            'var idx = ' + index + ';\n' +
            'var ctrl = thisComp.layer("Book Controller");\n' +
            'var step = ctrl.effect("Frame Step")(1);\n' +
            'var srcFD = thisLayer.source.frameDuration;\n' +
            'var srcDur = thisLayer.source.duration;\n' +
            'var t = idx * step * srcFD;\n' +
            'Math.min(Math.max(t, 0), Math.max(srcDur - srcFD, 0));';
    }

    function anchorAtSpine(layer, spineSide) {
        var width = layer.source ? layer.source.width : layer.width;
        var anchor = layer.transform.anchorPoint;
        var position = layer.transform.position;

        var oldAnchor = anchor.value;
        var newAnchorX = (spineSide === "right") ? width : 0;
        var scaleVal = layer.transform.scale.value;
        var sx = scaleVal[0] / 100;

        var deltaX = (newAnchorX - oldAnchor[0]) * sx;
        anchor.setValue([newAnchorX, oldAnchor[1], oldAnchor.length > 2 ? oldAnchor[2] : 0]);

        var oldPos = position.value;
        position.setValue([oldPos[0] + deltaX, oldPos[1], oldPos.length > 2 ? oldPos[2] : 0]);
    }

    function expressPositionZ(layer, index) {
        layer.transform.position.expression =
            'var idx = ' + index + ';\n' +
            'var ctrl = thisComp.layer("Book Controller");\n' +
            'var gap = ctrl.effect("Z Gap")(1);\n' +
            '[value[0], value[1], value[2] + idx * gap];';
    }

    function expressPageTurn(layer, index) {
        layer.transform.yRotation.expression =
            'var idx = ' + index + ';\n' +
            'var ctrl = thisComp.layer("Book Controller");\n' +
            'var turn = ctrl.effect("Page Turn")(1);\n' +
            'var spread = ctrl.effect("Turn Spread")(1);\n' +
            'var maxAngle = ctrl.effect("Turn Angle")(1);\n' +
            'var local = turn - idx * spread;\n' +
            'local = Math.max(0, Math.min(100, local));\n' +
            'value + (local / 100) * maxAngle;';
    }

    function expressBend(layer, index) {
        try {
            var pageTurnFx = layer.property("ADBE Effect Parade").addProperty("CC Page Turn");
        } catch (e) {
            return; // effect not available on this AE install - skip the bend flourish
        }
        try {
            pageTurnFx.property(1).expression = // Fold Position
                'var idx = ' + index + ';\n' +
                'var ctrl = thisComp.layer("Book Controller");\n' +
                'var turn = ctrl.effect("Page Turn")(1);\n' +
                'var spread = ctrl.effect("Turn Spread")(1);\n' +
                'var local = turn - idx * spread;\n' +
                'local = Math.max(0, Math.min(100, local));\n' +
                'var w = thisLayer.source.width;\n' +
                'var h = thisLayer.source.height;\n' +
                '[w * (1 - local / 100), h / 2];';
            pageTurnFx.property(3).expression = // Fold Radius
                'var ctrl = thisComp.layer("Book Controller");\n' +
                'var bend = ctrl.effect("Bend Amount")(1);\n' +
                'var w = thisLayer.source.width;\n' +
                '(bend / 100) * (w / 2);';
        } catch (e2) {
            // CC Page Turn's parameter layout can vary by AE version; leave the
            // effect on the layer for manual wiring rather than failing the rig.
        }
    }

    function pad(n, total) {
        var digits = String(total).length;
        var s = String(n);
        while (s.length < digits) s = "0" + s;
        return s;
    }

})();
