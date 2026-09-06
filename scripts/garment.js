/* scripts/garment.js — the garments, drawn.
 *
 * The catalogue's `image` values are placeholder photographs (picsum, seeded):
 * a sunset stood in for the Everyday Tee and a night skyline for the Relaxed
 * Shirt, so every card and every product page showed a picture of something
 * that was not the garment. Until real photography exists this file draws the
 * garment itself and wraps that photograph onto it as the cloth — a tee is
 * tee-shaped, a pant is pant-shaped, and the picture becomes the fabric it is
 * cut from.
 *
 * What is drawn is a small 3D scene, not a flat sticker:
 *
 *   back      the rear panel, pushed away from the viewer, seen through the
 *             neck opening and just past the silhouette's edge
 *   body      the torso, carrying the fabric image through a clip path
 *   sleeves   both sleeves on their own plane in front of the body, so they
 *             separate from it as the scene turns
 *   detail    collar, cuffs, hem ribbing, plackets, buttons, pockets — the
 *             layer nearest the viewer
 *
 * Those planes sit in a `transform-style: preserve-3d` scene (styles/main.css,
 * ".g3d") that tilts towards the pointer, so the sleeves and the collar move
 * against the body and the thing reads as an object with depth. A drag turns it
 * too, and so do the arrow keys (Home or Escape re-centres it). Reduced motion
 * takes away the hover chase and the easing and nothing else — a drag and an
 * arrow key are the reader's own doing, so they still turn the garment.
 *
 * Geometry is parametric rather than eleven hand-drawn silhouettes: one torso
 * builder takes shoulder, chest, waist and hem half-widths plus a sleeve length
 * and returns the torso and the two sleeves as separate paths. Every top —
 * tee, longsleeve, shirt, overshirt, knit, hoodie, jacket, dress — is that
 * builder with different numbers, so a fix to the armhole fixes all of them.
 * Pants, the cap and the scarf have their own small builders.
 *
 * No dependencies, no build step, plain browser JS — same rules as the rest of
 * the site. Everything is created with DOM APIs (createElementNS), never
 * innerHTML, so a product name or an alt text can never inject markup.
 *
 * This is the drawing, and it is also the floor. scripts/garment3d.js builds
 * the same garments as real geometry with three.js and takes over any stage it
 * can — but only once its mesh and its texture are both ready, and never at
 * all without WebGL. So everything here has to stand on its own, because on
 * some machine it is what the shopper sees. It owns the input for both: the
 * pointer, the drag and the arrow keys are handled once, here, and the angle
 * is handed to whichever renderer is on screen through stage.__garmentTurn.
 *
 * The shape a piece is drawn as is decided here too (GARMENT_SHAPES), so the
 * two renderers can never disagree about what a piece is.
 *
 * Public surface (all on window.Threadline):
 *   garmentShape(product)          the shape key this piece is drawn as
 *   garmentSVG(product, opts)      one flat <svg> of the garment
 *   garment3d(product, opts)       the layered, tiltable scene (an element)
 *   renderGarment(el, product)     replace an element's contents with the scene
 *   lookRack(pieces)               a look, as a rail of garments
 *   GARMENT_SHAPES                 id/category -> shape key, for tests
 */
(function (global) {
  "use strict";

  var T = global.Threadline || (global.Threadline = {});

  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";

  /* The drawing box every shape is built in. Wider than it is tall would crop
     a dress; 400x560 holds the longest piece with room for the floor shadow. */
  var VIEW_W = 400;
  var VIEW_H = 560;
  var MID = VIEW_W / 2;

  /* Filter and clip ids have to be unique per instance: two cards in the same
     grid each define their own <clipPath>, and a duplicate id would make the
     second garment wear the first one's shape. */
  var seq = 0;
  var uid = function (prefix) { return "g3d-" + prefix + "-" + (++seq); };

  var el = function (name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
    }
    return node;
  };

  var num = function (n) { return Math.round(n * 10) / 10; };

  /* ---- geometry ---------------------------------------------------------
     Everything below returns path data strings in the 400x560 box. A shape is
     an object of named paths; the renderer decides which plane each one is
     drawn on, so a builder never has to know about the 3D scene. */

  /* The armhole: shoulder -> armpit, as its four control points. The torso and
     the sleeve both have to follow exactly this line, or a sliver of studio
     shows between them where the seam should be — so it is written once and
     the sleeve simply walks it backwards. */
  var armhole = function (s, side) {
    return {
      shoulder: [MID + side * s.shoulderW, s.shoulderY],
      c1: [MID + side * (s.shoulderW + 2), s.shoulderY + (s.armpitY - s.shoulderY) * 0.45],
      c2: [MID + side * (s.chestW + 10), s.armpitY - 12],
      armpit: [MID + side * s.chestW, s.armpitY]
    };
  };

  /* One torso, mirrored around the middle.

       neckW      half-width of the neck opening
       neckDrop   how far the front neckline dips below the shoulder line
       shoulderY  y of the shoulder seam
       shoulderW  half-width at the shoulder
       chestW     half-width just under the arm
       waistW     half-width at the waist
       hemW       half-width at the hem
       armpitY    y where the sleeve leaves the body
       hemY       y of the hem
       hemDip     how much the hem curves down in the middle (a shirttail) */
  var torsoPath = function (s) {
    var neckTop = s.shoulderY - (s.neckRise || 4);
    var waistY = s.armpitY + (s.hemY - s.armpitY) * 0.55;
    var hemDip = s.hemDip || 0;

    var d = [];
    d.push("M", num(MID - s.neckW), num(neckTop));
    /* shoulder seam — a shade of droop, never a straight ruler line */
    d.push("Q", num(MID - s.shoulderW * 0.55), num(s.shoulderY - 3),
                num(MID - s.shoulderW), num(s.shoulderY));
    /* armhole down to the armpit — the same curve the sleeve closes on */
    var ahL = armhole(s, -1);
    d.push("C", num(ahL.c1[0]), num(ahL.c1[1]), num(ahL.c2[0]), num(ahL.c2[1]), num(ahL.armpit[0]), num(ahL.armpit[1]));
    /* side seam: chest -> waist -> hem */
    d.push("C", num(MID - s.chestW + (s.chestW - s.waistW) * 0.3), num(s.armpitY + (waistY - s.armpitY) * 0.5),
                num(MID - s.waistW), num(waistY - 10),
                num(MID - s.waistW), num(waistY));
    d.push("C", num(MID - s.waistW), num(waistY + (s.hemY - waistY) * 0.5),
                num(MID - s.hemW), num(s.hemY - (s.hemY - waistY) * 0.35),
                num(MID - s.hemW), num(s.hemY));
    /* the hem itself, dipping in the middle when the shape asks for it */
    d.push("Q", num(MID), num(s.hemY + hemDip + 8), num(MID + s.hemW), num(s.hemY));
    /* and back up the other side, mirrored */
    d.push("C", num(MID + s.hemW), num(s.hemY - (s.hemY - waistY) * 0.35),
                num(MID + s.waistW), num(waistY + (s.hemY - waistY) * 0.5),
                num(MID + s.waistW), num(waistY));
    d.push("C", num(MID + s.waistW), num(waistY - 10),
                num(MID + s.chestW - (s.chestW - s.waistW) * 0.3), num(s.armpitY + (waistY - s.armpitY) * 0.5),
                num(MID + s.chestW), num(s.armpitY));
    var ahR = armhole(s, 1);
    d.push("C", num(ahR.c2[0]), num(ahR.c2[1]), num(ahR.c1[0]), num(ahR.c1[1]), num(ahR.shoulder[0]), num(ahR.shoulder[1]));
    d.push("Q", num(MID + s.shoulderW * 0.55), num(s.shoulderY - 3),
                num(MID + s.neckW), num(neckTop));
    /* the neckline, closing the shape */
    d.push("C", num(MID + s.neckW * 0.6), num(neckTop + s.neckDrop),
                num(MID - s.neckW * 0.6), num(neckTop + s.neckDrop),
                num(MID - s.neckW), num(neckTop));
    d.push("Z");
    return d.join(" ");
  };

  /* One sleeve, hanging from the shoulder at `angle` degrees off vertical.
     side is -1 for the wearer's right (drawn left) and +1 for the other. */
  var sleevePath = function (s, side) {
    var len = s.sleeveLen;
    if (!len) return "";

    var a = (s.sleeveAngle || 26) * Math.PI / 180;
    var dx = side * Math.sin(a);
    var dy = Math.cos(a);
    /* across the sleeve, perpendicular to the way it hangs */
    var px = side * Math.cos(a);
    var py = -Math.sin(a);

    var ah = armhole(s, side);
    var sx = ah.shoulder[0], sy = ah.shoulder[1];
    var ax = ah.armpit[0], ay = ah.armpit[1];
    var cx = (sx + ax) / 2 + dx * len;
    var cy = (sy + ay) / 2 + dy * len;
    var cuff = s.cuffW || 34;

    var o1 = [cx + px * cuff, cy + py * cuff];   /* cuff, outer edge */
    var i1 = [cx - px * cuff, cy - py * cuff];   /* cuff, under the arm */

    /* Bow both long edges slightly so the sleeve has cloth in it. */
    var bow = len * 0.12;
    var d = [];
    d.push("M", num(sx), num(sy));
    d.push("Q", num(sx + dx * len * 0.55 + px * (cuff + bow)), num(sy + dy * len * 0.55 + py * (cuff + bow)),
                num(o1[0]), num(o1[1]));
    d.push("Q", num(cx), num(cy), num(i1[0]), num(i1[1]));
    d.push("Q", num(ax + dx * len * 0.5 - px * bow * 0.4), num(ay + dy * len * 0.5 - py * bow * 0.4),
                num(ax), num(ay));
    /* Back up the armhole the torso cut, so sleeve and body share that seam
       exactly and no studio shows through between them. */
    d.push("C", num(ah.c2[0]), num(ah.c2[1]), num(ah.c1[0]), num(ah.c1[1]), num(ah.shoulder[0]), num(ah.shoulder[1]));
    d.push("Z");
    return d.join(" ");
  };

  /* The cuff band across the end of a sleeve — the line that makes a long
     sleeve read as ribbed rather than simply cut off. */
  var cuffPath = function (s, side) {
    if (!s.sleeveLen) return "";
    var a = (s.sleeveAngle || 26) * Math.PI / 180;
    var dx = side * Math.sin(a), dy = Math.cos(a);
    var px = side * Math.cos(a), py = -Math.sin(a);
    var sx = MID + side * s.shoulderW, sy = s.shoulderY;
    var ax = MID + side * s.chestW, ay = s.armpitY;
    var len = s.sleeveLen - (s.cuffBand || 16);
    var cx = (sx + ax) / 2 + dx * len;
    var cy = (sy + ay) / 2 + dy * len;
    var cuff = (s.cuffW || 34) * 0.98;
    return "M " + num(cx + px * cuff) + " " + num(cy + py * cuff) +
           " L " + num(cx - px * cuff) + " " + num(cy - py * cuff);
  };

  /* A pair of trouser legs, built as two paths so they can sit on different
     planes and part as the scene turns. */
  var legPath = function (s, side) {
    var crotchY = s.crotchY;
    var outerTop = MID + side * s.hipW;
    var outerHem = MID + side * (s.legOuter + s.ankleW);
    var innerHem = MID + side * (s.legOuter - s.ankleW);
    var d = [];
    d.push("M", num(outerTop), num(s.waistY));
    d.push("C", num(outerTop + side * 4), num(s.waistY + (s.hemY - s.waistY) * 0.35),
                num(MID + side * (s.legOuter + s.ankleW + 14)), num(s.hemY - (s.hemY - s.waistY) * 0.35),
                num(outerHem), num(s.hemY));
    d.push("L", num(innerHem), num(s.hemY));
    d.push("C", num(MID + side * (s.legOuter - s.ankleW - 6)), num(s.hemY - (s.hemY - crotchY) * 0.5),
                num(MID + side * 10), num(crotchY + 40),
                num(MID + side * 3), num(crotchY));
    d.push("L", num(MID + side * 3), num(s.waistY));
    d.push("Z");
    return d.join(" ");
  };

  /* ---- the shapes -------------------------------------------------------
     Each entry returns the paths the renderer draws, plus the small details
     (seams, buttons, pockets) that tell one garment from another. */

  var top = function (over) {
    var s = {
      neckW: 42, neckDrop: 30, neckRise: 4,
      shoulderY: 96, shoulderW: 118,
      chestW: 128, waistW: 124, hemW: 130,
      armpitY: 210, hemY: 470, hemDip: 0,
      sleeveLen: 96, sleeveAngle: 30, cuffW: 44, cuffBand: 14
    };
    for (var k in over) {
      if (Object.prototype.hasOwnProperty.call(over, k)) s[k] = over[k];
    }
    return s;
  };

  /* A collar/neckband drawn as a band following the neckline. */
  var neckBand = function (s, thickness) {
    var t = thickness || 12;
    var neckTop = s.shoulderY - (s.neckRise || 4);
    var d = [];
    d.push("M", num(MID - s.neckW), num(neckTop));
    d.push("C", num(MID - s.neckW * 0.6), num(neckTop + s.neckDrop),
                num(MID + s.neckW * 0.6), num(neckTop + s.neckDrop),
                num(MID + s.neckW), num(neckTop));
    d.push("L", num(MID + s.neckW + t * 0.5), num(neckTop - t * 0.4));
    d.push("C", num(MID + s.neckW * 0.6), num(neckTop + s.neckDrop + t),
                num(MID - s.neckW * 0.6), num(neckTop + s.neckDrop + t),
                num(MID - s.neckW - t * 0.5), num(neckTop - t * 0.4));
    d.push("Z");
    return d.join(" ");
  };

  /* A shirt collar: a band round the back of the neck and two points falling
     from it onto the chest. Drawn as one path so the detail layer strokes and
     fills it in a single pass. */
  var shirtCollar = function (s) {
    var y = s.shoulderY - 2;
    var tip = y + s.neckDrop + 42;     /* where the points end */
    var d = [];
    /* left leaf: shoulder -> point -> back up the placket */
    d.push("M", num(MID - s.neckW - 12), num(y - 8));
    d.push("C", num(MID - s.neckW - 6), num(y + 20), num(MID - 34), num(tip - 34), num(MID - 16), num(tip));
    d.push("L", num(MID - 2), num(tip - 12));
    d.push("C", num(MID - 12), num(tip - 44), num(MID - s.neckW + 6), num(y + 16),
                num(MID - s.neckW - 12), num(y - 8));
    d.push("Z");
    /* right leaf, mirrored */
    d.push("M", num(MID + s.neckW + 12), num(y - 8));
    d.push("C", num(MID + s.neckW + 6), num(y + 20), num(MID + 34), num(tip - 34), num(MID + 16), num(tip));
    d.push("L", num(MID + 2), num(tip - 12));
    d.push("C", num(MID + 12), num(tip - 44), num(MID + s.neckW - 6), num(y + 16),
                num(MID + s.neckW + 12), num(y - 8));
    d.push("Z");
    /* the stand behind the neck */
    d.push("M", num(MID - s.neckW - 12), num(y - 8));
    d.push("C", num(MID - s.neckW * 0.5), num(y + s.neckDrop + 6),
                num(MID + s.neckW * 0.5), num(y + s.neckDrop + 6),
                num(MID + s.neckW + 12), num(y - 8));
    d.push("C", num(MID + s.neckW * 0.5), num(y + s.neckDrop - 8),
                num(MID - s.neckW * 0.5), num(y + s.neckDrop - 8),
                num(MID - s.neckW - 12), num(y - 8));
    d.push("Z");
    return d.join(" ");
  };

  var SHAPES = {
    /* --- knitted tops ---------------------------------------------------- */
    tee: function () {
      var s = top({});
      return {
        spec: s,
        detail: [
          { d: neckBand(s, 13), kind: "band" },
          { d: cuffPath(s, -1), kind: "seam" },
          { d: cuffPath(s, 1), kind: "seam" },
          { d: "M " + num(MID - s.hemW + 6) + " " + num(s.hemY - 16) +
               " Q " + num(MID) + " " + num(s.hemY - 8) + " " + num(MID + s.hemW - 6) + " " + num(s.hemY - 16), kind: "seam" }
        ]
      };
    },

    longsleeve: function () {
      var s = top({ sleeveLen: 214, sleeveAngle: 22, cuffW: 32, chestW: 118, waistW: 112, hemW: 116, hemY: 452 });
      return {
        spec: s,
        detail: [
          { d: neckBand(s, 11), kind: "band" },
          { d: cuffPath(s, -1), kind: "band-line" },
          { d: cuffPath(s, 1), kind: "band-line" },
          { d: "M " + num(MID - s.hemW + 4) + " " + num(s.hemY - 22) +
               " Q " + num(MID) + " " + num(s.hemY - 14) + " " + num(MID + s.hemW - 4) + " " + num(s.hemY - 22), kind: "band-line" }
        ],
        ribs: true
      };
    },

    knit: function () {
      var s = top({ sleeveLen: 224, sleeveAngle: 24, cuffW: 36, neckW: 46, neckDrop: 26, hemY: 448 });
      return {
        spec: s,
        detail: [
          { d: neckBand(s, 17), kind: "band" },
          { d: cuffPath(s, -1), kind: "band-line" },
          { d: cuffPath(s, 1), kind: "band-line" },
          { d: "M " + num(MID - s.hemW + 4) + " " + num(s.hemY - 26) +
               " Q " + num(MID) + " " + num(s.hemY - 18) + " " + num(MID + s.hemW - 4) + " " + num(s.hemY - 26), kind: "band" }
        ],
        ribs: true
      };
    },

    hoodie: function () {
      var s = top({ sleeveLen: 222, sleeveAngle: 23, cuffW: 38, chestW: 136, waistW: 132, hemW: 136, hemY: 452, neckW: 48, neckDrop: 22 });
      var hoodY = s.shoulderY - 4;
      return {
        spec: s,
        /* The hood sits behind the shoulders, so it is drawn on the back
           plane and shows above the neckline. */
        behind: [
          "M " + num(MID - s.neckW - 34) + " " + num(hoodY + 14) +
          " C " + num(MID - 88) + " " + num(hoodY - 42) + " " + num(MID + 88) + " " + num(hoodY - 42) + " " + num(MID + s.neckW + 34) + " " + num(hoodY + 14) +
          " C " + num(MID + 40) + " " + num(hoodY + 40) + " " + num(MID - 40) + " " + num(hoodY + 40) + " " + num(MID - s.neckW - 34) + " " + num(hoodY + 14) + " Z"
        ],
        detail: [
          /* the hood's front edge, over the shoulders */
          { d: "M " + num(MID - s.neckW - 34) + " " + num(hoodY + 12) +
               " C " + num(MID - 34) + " " + num(hoodY + 44) + " " + num(MID + 34) + " " + num(hoodY + 44) + " " + num(MID + s.neckW + 34) + " " + num(hoodY + 12), kind: "band-line" },
          /* drawcords */
          { d: "M " + num(MID - 16) + " " + num(hoodY + 30) + " L " + num(MID - 20) + " " + num(hoodY + 96), kind: "cord" },
          { d: "M " + num(MID + 16) + " " + num(hoodY + 30) + " L " + num(MID + 21) + " " + num(hoodY + 96), kind: "cord" },
          /* kangaroo pocket */
          { d: "M " + num(MID - 92) + " " + num(s.hemY - 150) +
               " L " + num(MID - 84) + " " + num(s.hemY - 46) +
               " L " + num(MID + 84) + " " + num(s.hemY - 46) +
               " L " + num(MID + 92) + " " + num(s.hemY - 150), kind: "seam" },
          { d: cuffPath(s, -1), kind: "band-line" },
          { d: cuffPath(s, 1), kind: "band-line" },
          { d: "M " + num(MID - s.hemW + 4) + " " + num(s.hemY - 28) +
               " Q " + num(MID) + " " + num(s.hemY - 20) + " " + num(MID + s.hemW - 4) + " " + num(s.hemY - 28), kind: "band" }
        ]
      };
    },

    /* --- buttoned tops ---------------------------------------------------- */
    shirt: function () {
      var s = top({ sleeveLen: 210, sleeveAngle: 22, cuffW: 32, neckW: 38, neckDrop: 16, hemY: 462, hemDip: 26, hemW: 126 });
      return {
        spec: s,
        detail: [
          { d: shirtCollar(s), kind: "band" },
          /* placket */
          { d: "M " + num(MID - 12) + " " + num(s.shoulderY + s.neckDrop + 26) + " L " + num(MID - 12) + " " + num(s.hemY + 18), kind: "seam" },
          { d: "M " + num(MID + 12) + " " + num(s.shoulderY + s.neckDrop + 26) + " L " + num(MID + 12) + " " + num(s.hemY + 18), kind: "seam" },
          /* chest pocket */
          { d: "M " + num(MID - 96) + " " + num(240) + " L " + num(MID - 96) + " " + num(292) +
               " L " + num(MID - 42) + " " + num(292) + " L " + num(MID - 42) + " " + num(240) + " Z", kind: "seam" },
          { d: cuffPath(s, -1), kind: "band-line" },
          { d: cuffPath(s, 1), kind: "band-line" }
        ],
        buttons: [[MID, 200], [MID, 262], [MID, 324], [MID, 386], [MID, 448]]
      };
    },

    overshirt: function () {
      var s = top({ sleeveLen: 214, sleeveAngle: 23, cuffW: 36, neckW: 40, neckDrop: 16,
                    shoulderW: 126, chestW: 140, waistW: 138, hemW: 142, hemY: 458 });
      return {
        spec: s,
        detail: [
          { d: shirtCollar(s), kind: "band" },
          { d: "M " + num(MID - 13) + " " + num(s.shoulderY + s.neckDrop + 24) + " L " + num(MID - 13) + " " + num(s.hemY - 4), kind: "seam" },
          { d: "M " + num(MID + 13) + " " + num(s.shoulderY + s.neckDrop + 24) + " L " + num(MID + 13) + " " + num(s.hemY - 4), kind: "seam" },
          /* two patch pockets */
          { d: "M " + num(MID - 108) + " " + num(276) + " L " + num(MID - 108) + " " + num(354) +
               " L " + num(MID - 36) + " " + num(354) + " L " + num(MID - 36) + " " + num(276) + " Z", kind: "seam" },
          { d: "M " + num(MID + 36) + " " + num(276) + " L " + num(MID + 36) + " " + num(354) +
               " L " + num(MID + 108) + " " + num(354) + " L " + num(MID + 108) + " " + num(276) + " Z", kind: "seam" },
          { d: cuffPath(s, -1), kind: "band-line" },
          { d: cuffPath(s, 1), kind: "band-line" }
        ],
        buttons: [[MID, 196], [MID, 262], [MID, 328], [MID, 394]]
      };
    },

    jacket: function () {
      var s = top({ sleeveLen: 208, sleeveAngle: 23, cuffW: 34, neckW: 40, neckDrop: 14,
                    shoulderW: 124, chestW: 136, waistW: 128, hemW: 132, hemY: 404 });
      return {
        spec: s,
        detail: [
          { d: shirtCollar(s), kind: "band" },
          { d: "M " + num(MID - 13) + " " + num(s.shoulderY + s.neckDrop + 22) + " L " + num(MID - 13) + " " + num(s.hemY - 30), kind: "seam" },
          { d: "M " + num(MID + 13) + " " + num(s.shoulderY + s.neckDrop + 22) + " L " + num(MID + 13) + " " + num(s.hemY - 30), kind: "seam" },
          /* yoke and the two flap pockets a denim jacket is known by */
          { d: "M " + num(MID - s.chestW + 8) + " " + num(214) + " Q " + num(MID) + " " + num(230) + " " + num(MID + s.chestW - 8) + " " + num(214), kind: "seam" },
          { d: "M " + num(MID - 92) + " " + num(238) + " L " + num(MID - 92) + " " + num(272) + " L " + num(MID - 40) + " " + num(272) + " L " + num(MID - 40) + " " + num(238) + " Z", kind: "seam" },
          { d: "M " + num(MID + 40) + " " + num(238) + " L " + num(MID + 40) + " " + num(272) + " L " + num(MID + 92) + " " + num(272) + " L " + num(MID + 92) + " " + num(238) + " Z", kind: "seam" },
          /* waistband */
          { d: "M " + num(MID - s.hemW + 4) + " " + num(s.hemY - 30) + " Q " + num(MID) + " " + num(s.hemY - 22) + " " + num(MID + s.hemW - 4) + " " + num(s.hemY - 30), kind: "band" },
          { d: cuffPath(s, -1), kind: "band-line" },
          { d: cuffPath(s, 1), kind: "band-line" }
        ],
        buttons: [[MID, 200], [MID, 258], [MID, 316], [MID, 374]]
      };
    },

    /* --- everything else -------------------------------------------------- */
    dress: function () {
      var s = top({ sleeveLen: 62, sleeveAngle: 40, cuffW: 40,
                    neckW: 44, neckDrop: 34, shoulderW: 104,
                    chestW: 108, waistW: 116, hemW: 176, hemY: 516 });
      return {
        spec: s,
        detail: [
          { d: neckBand(s, 10), kind: "band-line" },
          /* the seam where the column falls away from the body */
          { d: "M " + num(MID - 112) + " " + num(300) + " Q " + num(MID) + " " + num(312) + " " + num(MID + 112) + " " + num(300), kind: "seam" },
          /* side seam pockets */
          { d: "M " + num(MID - 128) + " " + num(330) + " L " + num(MID - 112) + " " + num(372), kind: "seam" },
          { d: "M " + num(MID + 128) + " " + num(330) + " L " + num(MID + 112) + " " + num(372), kind: "seam" },
          { d: "M " + num(MID - s.hemW + 8) + " " + num(s.hemY - 14) + " Q " + num(MID) + " " + num(s.hemY - 4) + " " + num(MID + s.hemW - 8) + " " + num(s.hemY - 14), kind: "seam" }
        ]
      };
    },

    pant: function () {
      var s = {
        waistY: 120, hipW: 116, crotchY: 250,
        legOuter: 62, ankleW: 40, hemY: 512, bandH: 34
      };
      return {
        spec: s,
        pant: true,
        legs: [legPath(s, -1), legPath(s, 1)],
        detail: [
          /* waistband, with the half-elastic gathering at the back */
          { d: "M " + num(MID - s.hipW) + " " + num(s.waistY + s.bandH) + " Q " + num(MID) + " " + num(s.waistY + s.bandH + 8) + " " + num(MID + s.hipW) + " " + num(s.waistY + s.bandH), kind: "band" },
          /* fly */
          { d: "M " + num(MID + 4) + " " + num(s.waistY + s.bandH) + " C " + num(MID + 18) + " " + num(s.waistY + 80) + " " + num(MID + 10) + " " + num(s.crotchY - 30) + " " + num(MID + 2) + " " + num(s.crotchY - 6), kind: "seam" },
          /* front pockets */
          { d: "M " + num(MID - s.hipW + 6) + " " + num(s.waistY + s.bandH + 10) + " C " + num(MID - 70) + " " + num(s.waistY + 84) + " " + num(MID - 58) + " " + num(s.waistY + 96) + " " + num(MID - 44) + " " + num(s.waistY + 96), kind: "seam" },
          { d: "M " + num(MID + s.hipW - 6) + " " + num(s.waistY + s.bandH + 10) + " C " + num(MID + 70) + " " + num(s.waistY + 84) + " " + num(MID + 58) + " " + num(s.waistY + 96) + " " + num(MID + 44) + " " + num(s.waistY + 96), kind: "seam" },
          /* the crease down each leg — what makes a flat shape read as a trouser */
          { d: "M " + num(MID - 62) + " " + num(s.crotchY + 10) + " L " + num(MID - 62) + " " + num(s.hemY - 12), kind: "crease" },
          { d: "M " + num(MID + 62) + " " + num(s.crotchY + 10) + " L " + num(MID + 62) + " " + num(s.hemY - 12), kind: "crease" }
        ]
      };
    },

    cap: function () {
      /* The head line the crown sits on and the brim leaves from. */
      var cy = 286, rx = 132, ry = 104;
      return {
        cap: true,
        spec: { cy: cy, rx: rx, ry: ry },
        /* crown: an unstructured dome, a little taller at the front seam */
        body: "M " + num(MID - rx) + " " + num(cy) +
              " C " + num(MID - rx - 4) + " " + num(cy - ry * 1.66) + " " + num(MID + rx + 4) + " " + num(cy - ry * 1.66) + " " + num(MID + rx) + " " + num(cy) +
              " C " + num(MID + rx * 0.6) + " " + num(cy + 22) + " " + num(MID - rx * 0.6) + " " + num(cy + 22) + " " + num(MID - rx) + " " + num(cy) + " Z",
        /* The brim, on the plane in front of the crown: it leaves the head line
           on both sides and peaks out to the wearer's left, so the cap reads in
           three-quarter view rather than as a bowl. */
        brim: "M " + num(MID - rx + 4) + " " + num(cy + 6) +
              " C " + num(MID - 40) + " " + num(cy + 104) + " " + num(MID + 120) + " " + num(cy + 96) + " " + num(MID + rx + 84) + " " + num(cy + 26) +
              " C " + num(MID + rx + 60) + " " + num(cy - 6) + " " + num(MID + rx + 18) + " " + num(cy - 4) + " " + num(MID + rx - 2) + " " + num(cy + 2) +
              " C " + num(MID + rx * 0.5) + " " + num(cy + 28) + " " + num(MID - rx * 0.5) + " " + num(cy + 28) + " " + num(MID - rx + 4) + " " + num(cy + 6) + " Z",
        detail: [
          /* the six panels */
          { d: "M " + num(MID) + " " + num(cy - ry * 1.24) + " L " + num(MID) + " " + num(cy + 14), kind: "seam" },
          { d: "M " + num(MID - 66) + " " + num(cy - ry * 1.02) + " C " + num(MID - 82) + " " + num(cy - 46) + " " + num(MID - 86) + " " + num(cy - 18) + " " + num(MID - 86) + " " + num(cy + 6), kind: "seam" },
          { d: "M " + num(MID + 66) + " " + num(cy - ry * 1.02) + " C " + num(MID + 82) + " " + num(cy - 46) + " " + num(MID + 86) + " " + num(cy - 18) + " " + num(MID + 86) + " " + num(cy + 6), kind: "seam" },
          /* the sweatband where the crown meets the brim */
          { d: "M " + num(MID - rx + 4) + " " + num(cy + 4) + " C " + num(MID - rx * 0.5) + " " + num(cy + 26) + " " + num(MID + rx * 0.5) + " " + num(cy + 26) + " " + num(MID + rx - 2) + " " + num(cy), kind: "band-line" },
          /* the stitch mark */
          { d: "M " + num(MID - 24) + " " + num(cy - 46) + " L " + num(MID + 24) + " " + num(cy - 46), kind: "band-line" },
          /* the brass adjuster at the back */
          { d: "M " + num(MID - rx + 2) + " " + num(cy - 10) + " L " + num(MID - rx - 12) + " " + num(cy - 6), kind: "cord" }
        ]
      };
    },

    scarf: function () {
      /* Two panels falling from a loop, so it drapes rather than lying flat. */
      var topY = 70, hemY = 500;
      return {
        scarf: true,
        spec: {},
        body: "M " + num(MID - 96) + " " + num(topY) +
              " C " + num(MID - 118) + " " + num(topY + 150) + " " + num(MID - 104) + " " + num(topY + 240) + " " + num(MID - 96) + " " + num(hemY) +
              " L " + num(MID - 16) + " " + num(hemY) +
              " C " + num(MID - 24) + " " + num(topY + 250) + " " + num(MID - 34) + " " + num(topY + 140) + " " + num(MID - 22) + " " + num(topY) + " Z",
        front: "M " + num(MID + 14) + " " + num(topY) +
              " C " + num(MID + 30) + " " + num(topY + 160) + " " + num(MID + 22) + " " + num(topY + 250) + " " + num(MID + 18) + " " + num(hemY - 34) +
              " L " + num(MID + 98) + " " + num(hemY - 34) +
              " C " + num(MID + 104) + " " + num(topY + 250) + " " + num(MID + 118) + " " + num(topY + 150) + " " + num(MID + 92) + " " + num(topY) + " Z",
        detail: [
          /* the fringe, both ends */
          { d: "M " + num(MID - 88) + " " + num(hemY) + " L " + num(MID - 88) + " " + num(hemY + 26), kind: "cord" },
          { d: "M " + num(MID - 68) + " " + num(hemY) + " L " + num(MID - 68) + " " + num(hemY + 30), kind: "cord" },
          { d: "M " + num(MID - 48) + " " + num(hemY) + " L " + num(MID - 48) + " " + num(hemY + 24), kind: "cord" },
          { d: "M " + num(MID - 28) + " " + num(hemY) + " L " + num(MID - 28) + " " + num(hemY + 30), kind: "cord" },
          { d: "M " + num(MID + 26) + " " + num(hemY - 34) + " L " + num(MID + 26) + " " + num(hemY - 6), kind: "cord" },
          { d: "M " + num(MID + 46) + " " + num(hemY - 34) + " L " + num(MID + 46) + " " + num(hemY - 2), kind: "cord" },
          { d: "M " + num(MID + 66) + " " + num(hemY - 34) + " L " + num(MID + 66) + " " + num(hemY - 6), kind: "cord" },
          { d: "M " + num(MID + 86) + " " + num(hemY - 34) + " L " + num(MID + 86) + " " + num(hemY - 2), kind: "cord" }
        ]
      };
    }
  };

  /* Which shape a piece is drawn as. The catalogue id wins (a Merino Crew Knit
     and a Lightweight Hoodie are both "Knitwear" but nothing alike); the
     category is the fallback so a garment added tomorrow still gets a shape,
     and "tee" catches anything unrecognised. */
  var SHAPE_BY_ID = {
    "everyday-tee": "tee",
    "ribbed-longsleeve": "longsleeve",
    "relaxed-shirt": "shirt",
    "woven-shirt": "shirt",
    "canvas-overshirt": "overshirt",
    "denim-jacket": "jacket",
    "lightweight-hoodie": "hoodie",
    "merino-crew": "knit",
    "casual-pant": "pant",
    "linen-dress": "dress",
    "classic-cap": "cap",
    "wool-scarf": "scarf"
  };

  var SHAPE_BY_CATEGORY = {
    "Tops": "tee",
    "Shirts": "shirt",
    "Knitwear": "knit",
    "Bottoms": "pant",
    "Outerwear": "jacket",
    "Dresses": "dress",
    "Accessories": "cap"
  };

  var garmentShape = function (product) {
    if (!product) return "tee";
    var id = String(product.id || "");
    if (SHAPE_BY_ID[id]) return SHAPE_BY_ID[id];
    var byCat = SHAPE_BY_CATEGORY[String(product.category || "")];
    return byCat || "tee";
  };

  /* ---- drawing ----------------------------------------------------------- */

  var STROKE = {
    seam:        { stroke: "rgba(15,23,42,0.30)", width: 2, dash: "7 6" },
    crease:      { stroke: "rgba(255,255,255,0.34)", width: 3, dash: null },
    band:        { stroke: "rgba(15,23,42,0.34)", width: 2.5, dash: null, fill: "rgba(255,255,255,0.12)" },
    "band-line": { stroke: "rgba(15,23,42,0.32)", width: 3, dash: null },
    cord:        { stroke: "rgba(255,255,255,0.62)", width: 4, dash: null }
  };

  /* One fabric-filled panel: the shape, clipped, with the product photograph
     inside it and the shading that turns a flat cut-out into cloth. */
  var panel = function (opts) {
    var g = el("g");
    var clipId = uid("clip");

    var clip = el("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
    (opts.paths || []).forEach(function (d) {
      if (d) clip.appendChild(el("path", { d: d }));
    });
    g.appendChild(clip);

    var inner = el("g", { "clip-path": "url(#" + clipId + ")" });

    /* the cloth: the catalogue photograph, cropped to cover the panel */
    if (opts.image) {
      var image = el("image", {
        x: -20, y: -20, width: VIEW_W + 40, height: VIEW_H + 40,
        preserveAspectRatio: "xMidYMid slice"
      });
      /* href is the modern spelling; xlink:href keeps older engines happy. */
      image.setAttribute("href", opts.image);
      image.setAttributeNS(XLINK_NS, "xlink:href", opts.image);
      if (opts.warp) image.setAttribute("filter", "url(#" + opts.warp + ")");
      inner.appendChild(image);
    } else {
      inner.appendChild(el("rect", { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: "#cbd5e1" }));
    }

    /* volume: dark at the two edges, light down the middle — a body under the
       cloth rather than a sheet of paper */
    inner.appendChild(el("rect", {
      x: 0, y: 0, width: VIEW_W, height: VIEW_H,
      fill: "url(#" + opts.round + ")", style: "mix-blend-mode:multiply"
    }));
    inner.appendChild(el("rect", {
      x: 0, y: 0, width: VIEW_W, height: VIEW_H,
      fill: "url(#" + opts.sheen + ")", style: "mix-blend-mode:screen"
    }));
    /* weight: the hem falls into shadow */
    inner.appendChild(el("rect", {
      x: 0, y: 0, width: VIEW_W, height: VIEW_H,
      fill: "url(#" + opts.drop + ")", style: "mix-blend-mode:multiply"
    }));

    /* folds: a few soft creases so the cloth is not glass */
    if (opts.folds) {
      var folds = el("g", { style: "mix-blend-mode:multiply", opacity: "0.5" });
      opts.folds.forEach(function (d) {
        folds.appendChild(el("path", {
          d: d, fill: "none", stroke: "rgba(15,23,42,0.22)", "stroke-width": 14,
          "stroke-linecap": "round", filter: "url(#" + opts.blur + ")"
        }));
      });
      inner.appendChild(folds);
    }

    g.appendChild(inner);

    /* the edge of the cloth */
    (opts.paths || []).forEach(function (d) {
      if (!d) return;
      g.appendChild(el("path", {
        d: d, fill: "none",
        stroke: "rgba(15,23,42,0.42)", "stroke-width": opts.edge || 2.5,
        "stroke-linejoin": "round"
      }));
    });

    return g;
  };

  /* The <defs> every panel of one garment shares. */
  var defsFor = function (ids, tone) {
    var defs = el("defs");

    var round = el("linearGradient", { id: ids.round, x1: "0", y1: "0", x2: "1", y2: "0" });
    [["0%", "#6b7280", "0.55"], ["18%", "#ffffff", "0"], ["50%", "#ffffff", "0"],
     ["82%", "#ffffff", "0"], ["100%", "#4b5563", "0.62"]].forEach(function (s) {
      round.appendChild(el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }));
    });
    defs.appendChild(round);

    var sheen = el("linearGradient", { id: ids.sheen, x1: "0", y1: "0", x2: "1", y2: "0" });
    [["22%", "#ffffff", "0"], ["40%", "#ffffff", "0.30"], ["46%", "#ffffff", "0.34"],
     ["62%", "#ffffff", "0"]].forEach(function (s) {
      sheen.appendChild(el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }));
    });
    defs.appendChild(sheen);

    var drop = el("linearGradient", { id: ids.drop, x1: "0", y1: "0", x2: "0", y2: "1" });
    [["0%", "#ffffff", "0"], ["58%", "#ffffff", "0"], ["100%", "#334155", "0.45"]].forEach(function (s) {
      drop.appendChild(el("stop", { offset: s[0], "stop-color": s[1], "stop-opacity": s[2] }));
    });
    defs.appendChild(drop);

    var blur = el("filter", { id: ids.blur, x: "-30%", y: "-30%", width: "160%", height: "160%" });
    blur.appendChild(el("feGaussianBlur", { stdDeviation: "9" }));
    defs.appendChild(blur);

    /* The cloth ripple. Only built for the large view: a displacement map on
       twelve grid cards is real work for the compositor and buys very little
       at thumbnail size. */
    if (ids.warp) {
      var warp = el("filter", { id: ids.warp, x: "-10%", y: "-10%", width: "120%", height: "120%" });
      var turb = el("feTurbulence", {
        type: "fractalNoise", baseFrequency: "0.011 0.024",
        numOctaves: "3", seed: String(tone || 3), result: "noise"
      });
      warp.appendChild(turb);
      warp.appendChild(el("feDisplacementMap", {
        in: "SourceGraphic", in2: "noise", scale: "17",
        xChannelSelector: "R", yChannelSelector: "G"
      }));
      defs.appendChild(warp);
    }

    return defs;
  };

  /* Fold lines that follow the shape of a top: from each armpit towards the
     opposite hip, plus one down the centre. */
  var foldsFor = function (shape) {
    var s = shape.spec || {};
    if (shape.cap || shape.scarf) return [];
    if (shape.pant) {
      return [
        "M " + num(MID - 90) + " " + num(s.crotchY + 40) + " Q " + num(MID - 74) + " " + num(s.crotchY + 140) + " " + num(MID - 66) + " " + num(s.hemY - 40),
        "M " + num(MID + 90) + " " + num(s.crotchY + 40) + " Q " + num(MID + 74) + " " + num(s.crotchY + 140) + " " + num(MID + 66) + " " + num(s.hemY - 40)
      ];
    }
    if (s.armpitY == null) return [];
    return [
      "M " + num(MID - s.chestW + 16) + " " + num(s.armpitY + 12) + " Q " + num(MID - 20) + " " + num(s.armpitY + 120) + " " + num(MID + 34) + " " + num(s.hemY - 30),
      "M " + num(MID + s.chestW - 16) + " " + num(s.armpitY + 12) + " Q " + num(MID + 26) + " " + num(s.armpitY + 130) + " " + num(MID - 30) + " " + num(s.hemY - 24),
      "M " + num(MID) + " " + num(s.armpitY + 40) + " Q " + num(MID + 10) + " " + num(s.hemY - 140) + " " + num(MID - 6) + " " + num(s.hemY - 20)
    ];
  };

  /* One <svg> plane. `which` selects what goes on it. */
  var plane = function (shape, product, ids, which, opts) {
    var svg = el("svg", {
      viewBox: "0 0 " + VIEW_W + " " + VIEW_H,
      xmlns: SVG_NS,
      class: "g3d-plane g3d-" + which,
      "aria-hidden": "true",
      focusable: "false"
    });

    var s = shape.spec || {};
    var image = product && product.image;

    if (which === "back") {
      /* The rear of the garment: the same silhouette, scaled a hair larger and
         pushed away, drawn dark. It is what the eye reads through the neck
         opening and along the edges as the scene turns. */
      var backPaths = [];
      if (shape.pant) { backPaths = shape.legs.slice(); }
      else if (shape.cap) { backPaths = [shape.body]; }
      else if (shape.scarf) { backPaths = [shape.body]; }
      else { backPaths = [torsoPath(s), sleevePath(s, -1), sleevePath(s, 1)]; }

      var g = el("g");
      backPaths.forEach(function (d) {
        if (!d) return;
        g.appendChild(el("path", { d: d, fill: "#2a2f3d", opacity: "0.92" }));
      });
      svg.appendChild(g);

      /* A hood is behind the shoulders but it is still cloth, not a hole:
         drawn here in the same fabric as the body, then pushed back with a
         shadow so it reads as being behind. */
      if ((shape.behind || []).length) {
        /* Its own gradient ids: the body plane's are already in the document
           and two <defs> answering to one id is a bug waiting to be found. */
        var backIds = { round: uid("round"), sheen: uid("sheen"), drop: uid("drop"), blur: uid("blur") };
        svg.appendChild(defsFor(backIds, 5));
        svg.appendChild(panel({
          paths: shape.behind, image: image,
          round: backIds.round, sheen: backIds.sheen, drop: backIds.drop, blur: backIds.blur
        }));
        var shade = el("g");
        shape.behind.forEach(function (d) {
          shade.appendChild(el("path", { d: d, fill: "#0f172a", opacity: "0.42" }));
        });
        svg.appendChild(shade);
      }
      return svg;
    }

    svg.appendChild(defsFor(ids, (String(product && product.id || "").length % 7) + 1));

    if (which === "body") {
      var bodyPaths;
      if (shape.pant) bodyPaths = shape.legs.slice();
      else if (shape.cap) bodyPaths = [shape.body];
      else if (shape.scarf) bodyPaths = [shape.body];
      else bodyPaths = [torsoPath(s)];

      svg.appendChild(panel({
        paths: bodyPaths, image: image, folds: foldsFor(shape),
        round: ids.round, sheen: ids.sheen, drop: ids.drop, blur: ids.blur,
        warp: opts.warp ? ids.warp : null
      }));
      return svg;
    }

    if (which === "front") {
      /* The plane between body and detail: sleeves on a top, the brim on a
         cap, the near panel of a scarf. Nothing for a pant. */
      var frontPaths = [];
      if (shape.cap) frontPaths = [shape.brim];
      else if (shape.scarf) frontPaths = [shape.front];
      else if (!shape.pant) frontPaths = [sleevePath(s, -1), sleevePath(s, 1)];

      if (!frontPaths.length || !frontPaths[0]) return null;

      svg.appendChild(panel({
        paths: frontPaths, image: image,
        round: ids.round, sheen: ids.sheen, drop: ids.drop, blur: ids.blur,
        warp: opts.warp ? ids.warp : null
      }));
      return svg;
    }

    /* which === "detail": seams, bands, cords, buttons. No fabric. */
    var detail = el("g");
    (shape.detail || []).forEach(function (item) {
      var style = STROKE[item.kind] || STROKE.seam;
      detail.appendChild(el("path", {
        d: item.d,
        fill: style.fill || "none",
        stroke: style.stroke,
        "stroke-width": style.width,
        "stroke-dasharray": style.dash,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }));
    });
    (shape.buttons || []).forEach(function (b) {
      detail.appendChild(el("circle", {
        cx: b[0], cy: b[1], r: 6.5,
        fill: "rgba(255,255,255,0.86)", stroke: "rgba(15,23,42,0.45)", "stroke-width": 1.5
      }));
    });
    if (!detail.childNodes.length) return null;
    svg.appendChild(detail);
    return svg;
  };

  /* ---- the scene --------------------------------------------------------- */

  var prefersReducedMotion = function () {
    try {
      return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  };

  /* Build the whole thing: a stage (perspective), a scene (preserve-3d) and
     the planes inside it. `opts.detail` is "card" (grid thumbnails: no cloth
     ripple, no pointer tracking) or "full" (the product page).

     Returns the stage element. The caller decides where it goes. */
  var garment3d = function (product, options) {
    var opts = options || {};
    var full = opts.detail !== "card";
    var shapeFn = SHAPES[garmentShape(product)] || SHAPES.tee;
    var shape = shapeFn();

    var ids = {
      round: uid("round"), sheen: uid("sheen"), drop: uid("drop"),
      blur: uid("blur"), warp: full ? uid("warp") : null
    };

    var stage = document.createElement("div");
    stage.className = "g3d" + (full ? " g3d-full" : " g3d-card");
    stage.dataset.shape = garmentShape(product);
    if (product && product.id) stage.dataset.productId = product.id;

    /* The garment is the picture of the piece: name it for anyone who cannot
       see it, and say what it is made of, because the cloth is the photograph
       the catalogue carries. */
    stage.setAttribute("role", "img");
    stage.setAttribute("aria-label",
      (product && product.name ? product.name : "Garment") +
      " — drawn in three dimensions, cut from the fabric shown");

    var scene = document.createElement("div");
    scene.className = "g3d-scene";

    var floor = document.createElement("div");
    floor.className = "g3d-floor";
    scene.appendChild(floor);

    ["back", "body", "front", "detail"].forEach(function (which) {
      var svg = plane(shape, product, ids, which, { warp: full });
      if (!svg) return;
      var layer = document.createElement("div");
      layer.className = "g3d-layer g3d-layer-" + which;
      layer.appendChild(svg);
      scene.appendChild(layer);
    });

    stage.appendChild(scene);

    /* ---- turning it ----
       Pointer, drag and the arrow keys all write the same two custom
       properties; styles/main.css does the rest.

       Reduced motion takes away the hover chase — movement nobody asked for,
       which is the whole of the complaint — and nothing else. A drag and an
       arrow key are the reader's own doing, so they still turn the garment,
       and main.css drops the easing so the turn is immediate rather than
       animated. */
    if (opts.interactive !== false) {
      var quiet = prefersReducedMotion();
      var rx = 0, ry = 0;
      var apply = function () {
        stage.style.setProperty("--g3d-rx", num(rx) + "deg");
        stage.style.setProperty("--g3d-ry", num(ry) + "deg");
        /* scripts/garment3d.js installs this when it has replaced the SVG
           planes on this stage with a real mesh. Input stays here — one
           implementation of the pointer, the drag and the arrow keys — and
           whichever renderer is on screen is told the same two angles. */
        if (typeof stage.__garmentTurn === "function") {
          try { stage.__garmentTurn(rx, ry); } catch (e) {}
        }
      };

      var track = function (clientX, clientY) {
        var box = stage.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var px = (clientX - box.left) / box.width - 0.5;
        var py = (clientY - box.top) / box.height - 0.5;
        ry = px * (full ? 34 : 22);
        rx = -py * (full ? 16 : 10);
        apply();
      };

      if (!quiet) {
        stage.addEventListener("pointermove", function (e) {
          if (e.pointerType === "touch") return;
          track(e.clientX, e.clientY);
        });
        stage.addEventListener("pointerleave", function () { rx = 0; ry = 0; apply(); });
      }

      if (full) {
        /* Dragging is the obvious gesture on a touch screen, and the one
           people try first with a mouse. */
        var dragging = false;
        stage.addEventListener("pointerdown", function (e) {
          dragging = true;
          try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        });
        stage.addEventListener("pointerup", function (e) {
          dragging = false;
          try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
        });
        stage.addEventListener("pointermove", function (e) {
          if (!dragging) return;
          e.preventDefault();
          track(e.clientX, e.clientY);
        });

        /* Keyboard: the same rotation without a pointer. */
        stage.tabIndex = 0;
        stage.addEventListener("keydown", function (e) {
          var step = 6;
          if (e.key === "ArrowLeft") { ry = Math.max(ry - step, -40); }
          else if (e.key === "ArrowRight") { ry = Math.min(ry + step, 40); }
          else if (e.key === "ArrowUp") { rx = Math.max(rx - step, -20); }
          else if (e.key === "ArrowDown") { rx = Math.min(rx + step, 20); }
          else if (e.key === "Home" || e.key === "Escape") { rx = 0; ry = 0; }
          else { return; }
          e.preventDefault();
          apply();
        });
      }
    }

    return stage;
  };

  /* A single flat <svg> of the garment — everything on one plane, no scene.
     Used where a 3D stage would be more than the page needs. */
  var garmentSVG = function (product, options) {
    var opts = options || {};
    var shapeFn = SHAPES[garmentShape(product)] || SHAPES.tee;
    var shape = shapeFn();
    var ids = {
      round: uid("round"), sheen: uid("sheen"), drop: uid("drop"),
      blur: uid("blur"), warp: opts.warp ? uid("warp") : null
    };

    var svg = el("svg", {
      viewBox: "0 0 " + VIEW_W + " " + VIEW_H, xmlns: SVG_NS,
      class: "g3d-flat", role: "img"
    });
    var title = el("title");
    title.textContent = (product && product.name) || "Garment";
    svg.appendChild(title);
    svg.appendChild(defsFor(ids, 3));

    var s = shape.spec || {};
    var paths;
    if (shape.pant) paths = shape.legs.slice();
    else if (shape.cap) paths = [shape.body, shape.brim];
    else if (shape.scarf) paths = [shape.body, shape.front];
    else paths = [sleevePath(s, -1), sleevePath(s, 1), torsoPath(s)];
    /* Whatever the 3D scene puts on its back plane — a hood — belongs in the
       flat drawing too, or the Lightweight Hoodie is just a sweatshirt. */
    (shape.behind || []).forEach(function (d) { if (d) paths.push(d); });

    svg.appendChild(panel({
      paths: paths, image: product && product.image, folds: foldsFor(shape),
      round: ids.round, sheen: ids.sheen, drop: ids.drop, blur: ids.blur,
      warp: opts.warp ? ids.warp : null
    }));

    var detail = el("g");
    (shape.detail || []).forEach(function (item) {
      var style = STROKE[item.kind] || STROKE.seam;
      detail.appendChild(el("path", {
        d: item.d, fill: style.fill || "none", stroke: style.stroke,
        "stroke-width": style.width, "stroke-dasharray": style.dash,
        "stroke-linecap": "round", "stroke-linejoin": "round"
      }));
    });
    (shape.buttons || []).forEach(function (b) {
      detail.appendChild(el("circle", {
        cx: b[0], cy: b[1], r: 6.5,
        fill: "rgba(255,255,255,0.86)", stroke: "rgba(15,23,42,0.45)", "stroke-width": 1.5
      }));
    });
    svg.appendChild(detail);
    return svg;
  };

  /* Replace a container's contents with the garment. Returns the stage, or
     null when there is nothing to draw — the caller keeps whatever it had. */
  var renderGarment = function (container, product, options) {
    if (!container || !product) return null;
    var stage = garment3d(product, options);
    container.textContent = "";
    container.appendChild(stage);
    return stage;
  };

  /* ---- a look, as a rack ------------------------------------------------
     lookbook.html showed one placeholder photograph per look while the caption
     underneath named two or three garments — so the picture and the list were
     about different things. A look is now the pieces it wears, drawn side by
     side on a rail: the same garments as the cards, in the same cloth, with
     the middle one nearest the viewer.

     `pieces` is what Threadline.looks() returns for a look: entries carrying a
     `product` when the id still resolves. An id we no longer make contributes
     nothing to the rack — the caption already prints its name as plain text. */
  var lookRack = function (pieces) {
    var products = (pieces || []).map(function (piece) {
      return piece && piece.product ? piece.product : null;
    }).filter(Boolean);
    if (!products.length) return null;

    var rack = document.createElement("div");
    rack.className = "look-rack";
    rack.dataset.count = String(products.length);
    rack.setAttribute("role", "img");
    rack.setAttribute("aria-label", products.map(function (p) { return p.name; }).join(", ") +
      " — drawn together, each in its own cloth");

    products.forEach(function (p, i) {
      var slot = document.createElement("div");
      slot.className = "look-rack-item";
      /* The middle of the rail is the front of the rail. */
      slot.style.setProperty("--rack-depth",
        String(Math.abs(i - (products.length - 1) / 2)));
      /* The lean is written as the stage's own turn, not as a CSS transform
         on the slot: a transform would skew whatever picture is inside it,
         and once scripts/garment3d.js has made that picture a mesh the right
         thing to turn is the garment. Both renderers read these. */
      var lean = ((i - (products.length - 1) / 2) * 7).toFixed(1);
      slot.appendChild(garment3d(p, { detail: "card", interactive: false }));
      slot.firstChild.style.setProperty("--g3d-ry", lean + "deg");

      rack.appendChild(slot);
    });

    return rack;
  };

  T.lookRack = lookRack;
  T.GARMENT_SHAPES = SHAPE_BY_ID;
  T.GARMENT_CATEGORY_SHAPES = SHAPE_BY_CATEGORY;
  T.garmentShape = garmentShape;
  T.garment3d = garment3d;
  T.garmentSVG = garmentSVG;
  T.renderGarment = renderGarment;

})(window);
