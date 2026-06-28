// SPDX-License-Identifier: GPL-2.0-or-later
// Cairo-drawn widgets for the popup. St's CSS subset can't do fractional widths
// or hatch fills, so the 24h tracks and the weekend strip are drawn by hand on
// St.DrawingArea. Each takes a getModel() callback read fresh on every repaint.

import St from 'gi://St';
import Clutter from 'gi://Clutter';

const GREEN = [0x57 / 255, 0xe3 / 255, 0x89 / 255];
const AMBER = [0xf5 / 255, 0xc2 / 255, 0x11 / 255];

function setColor(context, [red, green, blue], alpha = 1) {
    context.setSourceRGBA(red, green, blue, alpha);
}

function roundedRect(context, left, top, width, height, radius) {
    radius = Math.min(radius, width / 2, height / 2);
    context.newSubPath();
    context.arc(left + width - radius, top + radius, radius, -Math.PI / 2, 0);
    context.arc(left + width - radius, top + height - radius, radius, 0, Math.PI / 2);
    context.arc(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI);
    context.arc(left + radius, top + radius, radius, Math.PI, 1.5 * Math.PI);
    context.closePath();
}

// One market's 24h UTC track: bg, night bands, gridlines, session bar(s),
// amber now-line. getModel() -> { isOpen, segments:[{start,end}], nowFrac }.
export function makeTrack(getModel) {
    const area = new St.DrawingArea({
        style_class: 'marketbell-track',
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
    });
    area.connect('repaint', () => {
        const context = area.get_context();
        const [width, height] = area.get_surface_size();
        const model = getModel();

        setColor(context, [1, 1, 1], 0.045);
        roundedRect(context, 0, 0, width, height, 5);
        context.fill();

        // Dim the off-peak quarters (00–06, 18–24 UTC) like the concept sheet.
        setColor(context, [0, 0, 0], 0.14);
        context.rectangle(0, 0, width * 0.25, height); context.fill();
        context.rectangle(width * 0.75, 0, width * 0.25, height); context.fill();

        setColor(context, [1, 1, 1], 0.06);
        for (const gridFraction of [0.25, 0.5, 0.75]) {
            context.rectangle(Math.round(gridFraction * width), 0, 1, height); context.fill();
        }

        for (const segment of model.segments) {
            const barLeft = segment.start * width;
            const barWidth = Math.max(1, (segment.end - segment.start) * width);
            const barHeight = model.isOpen ? 9 : 7;
            if (model.isOpen) setColor(context, GREEN, 1);
            else setColor(context, [1, 1, 1], 0.30);
            roundedRect(context, barLeft, (height - barHeight) / 2, barWidth, barHeight, 4);
            context.fill();
        }

        setColor(context, AMBER, 1);
        context.rectangle(Math.round(model.nowFrac * width) - 1, 0, 2, height);
        context.fill();

        context.$dispose();
    });
    return area;
}

// The closed-state banner strip: a hatched "closed gap" spanning the day-cells
// from today to the next open, with UTC-midnight gridlines, an amber now-marker
// positioned proportionally, and the green next-open bell marker.
// getModel() -> { nowFrac, openFrac, grid: [0..1] }
export function makeWeekendStrip(getModel) {
    const area = new St.DrawingArea({ style_class: 'marketbell-weekstrip', x_expand: true });
    area.connect('repaint', () => {
        const context = area.get_context();
        const [width, height] = area.get_surface_size();
        const model = getModel();

        context.save();
        roundedRect(context, 0, 0, width, height, 6);
        context.clip();

        setColor(context, [1, 1, 1], 0.04);
        context.rectangle(0, 0, width, height); context.fill();

        setColor(context, [1, 1, 1], 0.10);
        context.setLineWidth(1);
        for (let diagonal = -height; diagonal < width; diagonal += 8) {
            context.moveTo(diagonal, height); context.lineTo(diagonal + height, 0); context.stroke();
        }

        setColor(context, [1, 1, 1], 0.14);
        for (const gridFraction of model.grid) {
            context.rectangle(Math.round(gridFraction * width), 0, 1, height); context.fill();
        }
        context.restore();

        drawMarker(context, GREEN, model.openFrac * width, width, height);
        drawMarker(context, AMBER, model.nowFrac * width, width, height);

        context.$dispose();
    });
    return area;
}

// A 2px vertical line with a dot at the top, clamped inside the strip.
function drawMarker(context, color, positionX, width, height) {
    positionX = Math.max(1, Math.min(Math.round(positionX), width - 2));
    setColor(context, color, 1);
    context.rectangle(positionX, 0, 2, height); context.fill();
    context.arc(positionX + 1, 4, 3, 0, 2 * Math.PI); context.fill();
}