"use strict";


class Request {
    constructor(value, queue, offset) {
        this.value = value;
        this.queue = queue;
        this.offset = offset;
        this.stime = new Date().getTime() / 1000;
        this.r_obj = null;
    }

    move(x, y, tout, cb) {
        this.r_obj.animate({"cx": x, "cy": y, "x": x, "y": y}, tout, cb);
    }

    get_xy() {
        return [this.r_obj.items[0].attrs["cx"], this.r_obj.items[0].attrs["cy"]];
    }
}

class SQStorage {
    constructor(size, max_mv) {
        this.size = size;
        this.position = 0;
        this.reqs = {};
        this.max_mv = max_mv;
        this.next_req = null;
        this.vals = new Array(size).fill(0);
        this.r_texts = [];
        this.r_head = null;
        this.ycenter = null;
    }

    detect_next() {
        let next_w = Number.MIN_SAFE_INTEGER;
        const ctime = new Date().getTime() / 1000;
        for(const offset in this.reqs) {
            const offseti = parseInt(offset, 10);
            const req = this.reqs[offset][0];
            if (this.position === offseti) {
                this.next_req = req;
                break;
            }
            const w = (ctime - req.stime) - Math.abs(this.position - offseti) / this.max_mv;
            if (w > next_w) {
                next_w = w;
                this.next_req = req;
            }
        }
    }

    all_req() {
        let res = [];
        for(const req_offset in this.reqs)
            res = res.concat(this.reqs[req_offset]);
        return res;
    }

    send(req) {
        if (req.offset in this.reqs) {
            this.reqs[req.offset].push(req);
        } else {
            this.reqs[req.offset] = [req];
        }
        this.detect_next();
    }

    tick() {
        if (this.next_req) {
            for(const req of this.all_req()) {
                const off = req.offset;
                if (this.position === off) {
                    this.vals[off] = req.value;
                    this.reqs[off].shift();
                    if (this.reqs[off].length === 0)
                        delete this.reqs[off];
                    this.next_req = null;
                    this.detect_next();
                    return req;
                }
            }
            const delta = min(this.max_mv, Math.abs(this.position - this.next_req.offset));
            this.position += (this.position > this.next_req.offset ? -delta : delta);
        }
    }
}

class Storage {
    constructor(q_count, size) {
        this.execs = [];
        for(let i = 0; i < q_count ; i++) {
            this.execs.push(new SQStorage(size, 1));
        }
        this.size = size;
        this.q_count = q_count;
    }

    send(req) {
        this.execs[req.queue].send(req);
    }
}

function rand_int(max) {
  return Math.floor(Math.random() * Math.floor(max));
}


//
//
//               |--------------------V
//               |-- {oooo }      [k    k     j     ]
//               |      |---------------------V
//  APP [ooo] ---|-- {oo   }      [   rrr           ]
//               |      |-----------------V
//               |-- {ooo  }      [     a     f   g ]
//
//
//


function min(a, b) {
    return (a < b ? a : b);
}

function to_pairs(arr) {
    let res = [];
    for(let idx = 0 ; idx < arr.length ; idx += 2) {
        res.push([arr[idx], arr[idx + 1]]);
    }
    return res;
}

function pp(args) {
    let path = null;
    for(const [x, y] of to_pairs(args)) {
        if (path === null)
            path = `M${x},${y}`;
        else
            path += `L${x},${y}`;
    }
    return path;
}

function mline() {
    return this.path(pp(arguments));
}

function mlinez() {
    return this.path(pp(arguments) + "Z");
}


function arrow(x1, y1, x2, y2, arr_part, angle) {
    const path = pp([x1, y1, x2, y2]);
    this.path(path);

    const x3 = x2 - (x2 - x1) * arr_part;
    const y3 = y2 - (y2 - y1) * arr_part;

    const arr_path = pp([x2, y2, x3, y3]);
    if (!angle) {
        angle = 30;
    }
    this.path(arr_path).rotate(angle, x2, y2);
    this.path(arr_path).rotate(-angle, x2, y2);
}


const space = 10;
const border = space;
const q_cells = 7;
const app_q_cells = 3;
const from_main_q_tracks_w = 150;
const main_q_storage_space = 100;
const fs_large = 34;
const fs_normal = 20;
const fs_normal_plus = 34;

const produce_loop_timeout = 200;
const request_shift_time = 200;
const process_loop_tout = 500;
const process_loop_tout_short = 100;
const process_loop_tout_hmove = 10;
const move_input_req_loop_tout = 200;
const text_color_tout = 1000;
const move_speed = 0.7;
const move_speed2 = 1.5;
const average_slice = 10;

const start_req_c = 0;
const bus_stroke_with = 1;
const sin60 = Math.sin(Math.PI / 3);

function last(arr) {
    return arr[arr.length - 1];
}

function zip(arr1, arr2) {
    const res = [];
    for(let i = 0 ; i < arr1.length ; i++) {
        res.push([arr1[i], arr2[i]]);
    }
    return res;
}


function animate_on_points(obj, pts, move_speed, end_cb) {
    let pairs = to_pairs(pts);
    let segments = zip(pairs.slice(0, -1), pairs.slice(1));
    segments.unshift([obj.get_xy(), segments[0][0]]);
    let dists = [];
    for(const [pt1, pt2] of segments) {
        dists.push(Math.sqrt((pt1[0] - pt2[0]) * (pt1[0] - pt2[0]) + (pt1[1] - pt2[1]) * (pt1[1] - pt2[1])));
    }

    function move_to_next() {
        if (!!pairs.length) {
            const [nx, ny] = pairs[0];
            const dist = dists[0];
            pairs.shift();
            dists.shift();
            obj.move(nx, ny, dist / move_speed, move_to_next);
        } else {
            if (end_cb)
                end_cb();
        }
    }
    move_to_next();
}


class Animation {
    constructor(tag_id, w, h, qcount, size, qd) {
        this.qcount = qcount;
        this.size = size;
        this.qd = qd;
        this.cvalue = rand_int(5);

        this.raphael = Raphael(tag_id, w, h);
        this.raphael.__proto__.mline = mline;
        this.raphael.__proto__.mlinez = mlinez;
        this.raphael.__proto__.arrow = arrow;

        this.storage = new Storage(this.qcount, this.size);
        this.app_q_reqs = [];
        this.storages_v_centers = [];
        this.total_active_reqs = 0;

        const stor_v_step = ((h - 2 * border) - (this.qcount * 2 - 1) * space) / (2 * this.qcount);

        const total_cells = app_q_cells + q_cells + this.size;
        const cell_size_h_limit = (h - (2 * this.qcount - 1) * space - 2 * border) / this.qcount;

        // calc this.storage centers
        let curr_v_pos = border + stor_v_step * 1.5 + space;
        for (let i = 0; i < this.qcount; i++) {
            this.storages_v_centers.push(curr_v_pos);
            curr_v_pos += (stor_v_step + space) * 2;
            this.storage.execs[i].ycenter = curr_v_pos;
        }
        this.y_and_exec = zip(this.storages_v_centers, this.storage.execs);
        this.vcenter = (this.storages_v_centers[0] + last(this.storages_v_centers)) / 2;

        // draw static part
        this.new_reqs_x = this.draw_app(border) + space;

        const cell_size_w_limit = (w - this.new_reqs_x - border - from_main_q_tracks_w - main_q_storage_space
            - 2 * space) / total_cells;
        this.cell_size = min(cell_size_w_limit, cell_size_h_limit);
        this.req_radius = (this.cell_size - space) / 2;

        this.qd_label = this.raphael.text(150, 50, `Target QD = ${qd}`).attr({'font-size': fs_large});
        this.atc_qd_label = this.raphael.text(150, 100, `Actual QD = --`).attr({'font-size': fs_large});
        this.rps_label = this.raphael.text(150, 150, "RPS = ---").attr({'font-size': fs_large});
        this.lat_label = this.raphael.text(150, 200, "LAT = ---").attr({'font-size': fs_large});

        this.track_start_x = this.draw_app_queue(this.new_reqs_x) + space;
        this.track_conn_pt_x = null;
        this.track_ends_x = null;

        this.queues_start_x = this.draw_tracks(this.track_start_x) + space;
        this.queues_end_x = this.queues_start_x + this.cell_size * q_cells;
        this.storage_start_x = this.draw_queues(this.queues_start_x) + main_q_storage_space;
        this.draw_storage(this.storage_start_x);
        this.draw_heads(this.storage_start_x);
        this.app_q_animation_in_progress = false;
        this.stime = new Date().getTime() / 1000;
        this.paused = false;
        this.history = [];
    }

    mainloop() {
        let self = this;
        window.addEventListener('keydown',
            (evt) => {
                if (evt.code === "Space") {
                    self.paused = !self.paused;
                } else if (evt.code === "ArrowUp") {
                    self.qd++;
                    this.qd_label.attr({"text": `Target QD = ${self.qd}`});
                } else if (evt.code === "ArrowDown" && self.qd > 1) {
                    self.qd--;
                    this.qd_label.attr({"text": `Target QD = ${self.qd}`});
                }
            }, false);

        for (let i = 0; i < start_req_c; i++) {
            const req = new Request(this.cvalue, rand_int(this.qcount), rand_int(this.size));
            this.storage.send(req);
            this.cvalue += rand_int(5);
        }

        this.produce_req_loop();
        this.move_input_requests_loop();
        for(const exec of this.storage.execs)
            this.process_requests_loop(exec);
    }

    produce_req_loop() {

        const self = this;
        function cl() {
            if (!self.paused && !self.app_q_animation_in_progress) {
                if (self.total_active_reqs < self.qd && self.app_q_reqs.length < app_q_cells) {
                    let req = new Request(self.cvalue, rand_int(self.qcount), rand_int(self.size));
                    self.draw_req(req,
                        self.new_reqs_x + (app_q_cells - self.app_q_reqs.length - 0.5) * self.cell_size,
                        self.vcenter);
                    self.app_q_reqs.push(req);
                    self.cvalue += rand_int(5);
                    self.total_active_reqs++;
                }
            }
            setTimeout(cl, produce_loop_timeout);
        }
        cl();
    }

    on_req_done(req) {
        const ctime = new Date().getTime() / 1000;

        if (req !== null) {
            this.history.push([ctime, ctime - req.stime]);
        }

        if (ctime - this.stime > 1.0) {
            this.atc_qd_label.attr({"text": `Actual QD = ${this.total_active_reqs}`});

            while(this.history.length !== 0 && ctime - this.history[0][0] > average_slice)
                this.history.shift();

            if (this.history.length !== 0) {
                let total_time = 0;
                let min_time = this.history[0][0];
                for(const rec of this.history)
                    total_time += rec[1];

                let rps = "RPS = 0";
                if (ctime - min_time > 1.0)
                    rps = `RPS = ${(this.history.length / (ctime - min_time)).toFixed(1)}`;
                this.rps_label.attr({"text": rps});
                this.lat_label.attr({"text": `LAT = ${(total_time / this.history.length).toFixed(1)}`});
            } else {
                this.lat_label.attr({"text": "LAT = ---"});
                this.rps_label.attr({"text": "RPS = 0"});
            }

            this.stime = ctime;
        }
    }

    move_input_requests_loop() {
        const self = this;
        function cl() {
            if (!self.paused && !!self.app_q_reqs.length) {
                // move first request over the bus
                const req = self.app_q_reqs[0];
                self.app_q_reqs.shift();

                const pts = [self.track_start_x, self.vcenter,
                    self.track_conn_pt_x, self.vcenter,
                    self.track_conn_pt_x, self.storages_v_centers[req.queue],
                    self.track_ends_x, self.storages_v_centers[req.queue]];

                animate_on_points(req, pts, move_speed, () => {
                    const exec = self.storage.execs[req.queue];
                    exec.send(req);
                    self.update_q_req_pos(exec);
                });

                // shift other requests in queue
                if (!!self.app_q_reqs.length) {
                    for (const rr of self.app_q_reqs.slice(0, -1)) {
                        const [x, y] = rr.get_xy();
                        rr.move(x + self.cell_size, y, request_shift_time);
                        self.app_q_animation_in_progress = true;
                    }
                    let rr = last(self.app_q_reqs);
                    const [x, y] = rr.get_xy();
                    rr.move(x + self.cell_size, y, request_shift_time, () => {self.app_q_animation_in_progress = false});
                }
            }
            setTimeout(cl, move_input_req_loop_tout);
        }
        cl();
    }

    process_requests_loop(exec) {
        const self = this;
        let request_in_flight = false;
        let head_move_left = null;
        const head_step_max = 10;
        function cl() {
            if (self.paused) {
                setTimeout(cl, process_loop_tout);
                return;
            }
            if (head_move_left !== null) {
                let mv = Math.sign(head_move_left) * Math.min(head_step_max, Math.abs(head_move_left));
                exec.r_head.translate(mv, 0);
                head_move_left -= mv;
                if (Math.abs(head_move_left) < 1E-5) {
                    head_move_left = null;
                } else {
                    setTimeout(cl, process_loop_tout_hmove);
                    return;
                }
            }
            if (!request_in_flight) {
                let old_head_pos = exec.position;
                let req = exec.tick();

                if (exec.position !== old_head_pos) {
                    head_move_left = (exec.position - old_head_pos) * self.cell_size;
                    setTimeout(cl, process_loop_tout_hmove);
                    return;
                }

                // requests executed
                if (!!req) {
                    // move request to head, then update storage value in cell
                    const [x, y] = req.get_xy();
                    req.r_obj.attr({"opacity": 1.0});
                    animate_on_points(req, [
                        x, y - self.cell_size,
                        self.storage_start_x + exec.position * self.cell_size - self.cell_size / 2, y - self.cell_size
                    ], move_speed2, () => {
                        req.r_obj.remove();
                        self.sync_sqstorage_vals(exec);
                        request_in_flight = false;
                        exec.r_texts[req.offset].attr({"fill": "#F66", "font-size": fs_normal_plus});
                        exec.r_texts[req.offset].animate({"fill": "#000", "font-size": fs_normal}, text_color_tout);
                    });
                    request_in_flight = true;
                    // move all other requests in the queue
                    let xpos = self.queues_start_x + self.cell_size / 2;
                    for (const req of exec.all_req()) {
                        let [cx, cy] = req.get_xy();
                        if (cx !== xpos)
                            req.move(xpos, cy, request_shift_time);
                        xpos += self.cell_size;
                    }
                    self.total_active_reqs--;
                    self.on_req_done(req);
                } else {
                    self.on_req_done(null);
                }
                setTimeout(cl, process_loop_tout);
            } else {
                setTimeout(cl, process_loop_tout_short);
            }
        }
        cl();
    }

    // draw/update requests & storage values
    draw_req(req, x, y) {
        const circle = this.raphael.circle(x, y, this.req_radius);
        const rtext = this.raphael.text(x, y, req.value);
        rtext.attr({"font-size": fs_normal});

        const color = Raphael.hsb(req.queue / this.qcount, req.offset / this.size / 1.5 + 0.1666, 1);
        circle.attr({"fill": color});

        req.r_obj = this.raphael.set();
        req.r_obj.push(circle, rtext);

        return req.r_obj;
    }

    sync_sqstorage_vals(exec) {
        for (const [vl, txt] of zip(exec.vals, exec.r_texts)) {
            txt.attr({"text": vl});
        }
    }

    update_q_req_pos(exec) {
        let xpos = this.queues_start_x + this.cell_size / 2;
        for(let req of exec.all_req()) {
            if (xpos < this.queues_end_x) {
                const [old_x, y] = req.get_xy();
                req.r_obj.attr({"opacity": 1.0});
                req.move(xpos, y, 0);
            } else {
                req.r_obj.attr({"opacity": 0.0});
            }
            xpos += this.cell_size;
        }
    }

    // draw static part
    draw_app(x) {
        // draw static APPs text
        const txt = this.raphael.text(x, this.vcenter, "APPs");
        txt.attr({"font-size": fs_large});
        txt.attr({"x": x - txt.getBBox().x});
        return x + txt.getBBox().x2;
    }

    draw_app_queue(x) {
        this.raphael.rect(x, this.vcenter - this.cell_size / 2, this.cell_size * app_q_cells, this.cell_size);
        return x + this.cell_size * app_q_cells;
    }

    draw_tracks(x) {
        // draw req_set -> queues tracks
        this.track_conn_pt_x = x + from_main_q_tracks_w * 0.7;
        this.raphael.mline(x, this.vcenter, this.track_conn_pt_x, this.vcenter).attr({"stroke-width": bus_stroke_with});
        this.raphael.mline(this.track_conn_pt_x, this.storages_v_centers[0],
            this.track_conn_pt_x, last(this.storages_v_centers));

        this.track_ends_x = this.track_conn_pt_x + from_main_q_tracks_w * 0.3;
        for (const y of this.storages_v_centers) {
            this.raphael.arrow(this.track_conn_pt_x, y, this.track_ends_x, y, 0.2);
        }

        return this.track_ends_x;
    }

    draw_queues(x) {
        for (const idx in this.storages_v_centers) {
            const y = this.storages_v_centers[idx];
            const color = Raphael.hsb(idx / this.qcount, 0.2, 1);

            let q = this.raphael.rect(x, y - this.cell_size / 2, this.cell_size * q_cells, this.cell_size);
            q.attr({"fill": color});
        }

        return x + this.cell_size * q_cells;
    }

    draw_storage(x) {
        for (const [y, exec] of this.y_and_exec) {
            const ystart = y - this.cell_size / 2;
            const ystop = y + this.cell_size / 2;

            this.raphael.rect(x, ystart, this.cell_size * this.size, ystop - ystart);
            for (let x1 = x + this.cell_size; x1 < x + this.cell_size * this.size; x1 += this.cell_size) {
                this.raphael.mline(x1, ystart, x1, ystop);
            }

            let cx = x + this.cell_size / 2;
            for (const vl of exec.vals) {
                exec.r_texts.push(this.raphael.text(cx, y, vl).attr({"font-size": fs_normal}));
                cx += this.cell_size;
            }
        }
    }

    draw_heads(x) {
        // draw heads positions
        const tr_r = this.cell_size * 0.3;
        for (const [y, exec] of this.y_and_exec) {
            const cy_pos = y - space - this.cell_size;
            const cx_pos = x + (exec.position + 0.5) * this.cell_size;
            exec.r_head = this.raphael.mlinez(cx_pos, cy_pos + tr_r,
                                              cx_pos - tr_r * sin60, cy_pos - tr_r / 2,
                                              cx_pos + tr_r * sin60, cy_pos - tr_r / 2);
        }
    }
}
