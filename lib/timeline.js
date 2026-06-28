// Cairo-drawn widgets for the popup. St's CSS subset can't do fractional widths
// or hatch fills, so the 24h tracks and the weekend strip are drawn by hand on
// St.DrawingArea. Each takes a getModel() callback read fresh on every repaint.

import St from 'gi://St';
import Clutter from 'gi://Clutter';

const GREEN = [0x57 / 255, 0xe3 / 255, 0x89 / 255];
const AMBER = [0xf5 / 255, 0xc2 / 255, 0x11 / 255];

function rgba(cr, [r, g, b], a = 1) {
    cr.setSourceRGBA(r, g, b, a);
}

function roundRect(cr, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
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
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const m = getModel();

        rgba(cr, [1, 1, 1], 0.045);
        roundRect(cr, 0, 0, w, h, 5);
        cr.fill();

        // Dim the off-peak quarters (00–06, 18–24 UTC) like the concept sheet.
        rgba(cr, [0, 0, 0], 0.14);
        cr.rectangle(0, 0, w * 0.25, h); cr.fill();
        cr.rectangle(w * 0.75, 0, w * 0.25, h); cr.fill();

        rgba(cr, [1, 1, 1], 0.06);
        for (const f of [0.25, 0.5, 0.75]) {
            cr.rectangle(Math.round(f * w), 0, 1, h); cr.fill();
        }

        for (const s of m.segments) {
            const bx = s.start * w;
            const bw = Math.max(1, (s.end - s.start) * w);
            const bh = m.isOpen ? 9 : 7;
            if (m.isOpen) rgba(cr, GREEN, 1);
            else rgba(cr, [1, 1, 1], 0.30);
            roundRect(cr, bx, (h - bh) / 2, bw, bh, 4);
            cr.fill();
        }

        rgba(cr, AMBER, 1);
        cr.rectangle(Math.round(m.nowFrac * w) - 1, 0, 2, h);
        cr.fill();

        cr.$dispose();
    });
    return area;
}

// The closed-state banner strip: hatched "closed gap" with amber now at the
// left edge and the green next-open bell at the right edge.
export function makeWeekendStrip() {
    const area = new St.DrawingArea({ style_class: 'marketbell-weekstrip', x_expand: true });
    area.connect('repaint', () => {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();

        cr.save();
        roundRect(cr, 0, 0, w, h, 6);
        cr.clip();

        rgba(cr, [1, 1, 1], 0.04);
        cr.rectangle(0, 0, w, h); cr.fill();

        rgba(cr, [1, 1, 1], 0.10);
        cr.setLineWidth(1);
        for (let x = -h; x < w; x += 8) {
            cr.moveTo(x, h); cr.lineTo(x + h, 0); cr.stroke();
        }
        cr.restore();

        rgba(cr, AMBER, 1);
        cr.rectangle(0, 0, 2, h); cr.fill();
        rgba(cr, GREEN, 1);
        cr.rectangle(w - 2, 0, 2, h); cr.fill();

        cr.$dispose();
    });
    return area;
}
