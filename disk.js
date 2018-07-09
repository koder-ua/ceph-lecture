"use strict";

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


function rand_int(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

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

class IORequest {
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

class StorageUnit {
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
    constructor(unit_count, unit_size) {
        this.execs = [];
        for(let i = 0; i < unit_count ; i++) {
            this.execs.push(new StorageUnit(unit_size, storage_max_head_mv));
        }
        this.size = unit_size;
        this.q_count = unit_count;
    }

    send(req) {
        this.execs[req.queue].send(req);
    }
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


class Scene {
    constructor(tag_id, w, h, unit_count, storage_unit_size, qd) {
        this.unit_count = unit_count;
        this.size = storage_unit_size;
        this.qd = qd;
        this.cvalue = rand_int(5);

        this.raphael = Raphael(tag_id, w, h);
        this.raphael.__proto__.mline = mline;
        this.raphael.__proto__.mlinez = mlinez;
        this.raphael.__proto__.arrow = arrow;

        this.storage = new Storage(this.unit_count, this.size);
        this.app_q_reqs = [];
        this.storages_v_centers = [];
        this.total_active_reqs = 0;

        const stor_v_step = ((h - 2 * border) - (this.unit_count * 2 - 1) * space) / (2 * this.unit_count);

        const total_cells = app_q_cells + q_cells + this.size;
        const cell_size_h_limit = (h - (2 * this.unit_count - 1) * space - 2 * border) / (2 * this.unit_count);

        // calc this.storage centers
        let curr_v_pos = border + stor_v_step * 1.5 + space;
        for (let i = 0; i < this.unit_count; i++) {
            this.storages_v_centers.push(curr_v_pos);
            curr_v_pos += (stor_v_step + space) * 2;
            this.storage.execs[i].ycenter = curr_v_pos;
        }
        this.y_and_exec = zip(this.storages_v_centers, this.storage.execs);
        this.vcenter = (this.storages_v_centers[0] + last(this.storages_v_centers)) / 2;

        // draw APP text to calculate it's size
        this.new_reqs_x = this.draw_app(border) + space;

        const cell_size_w_limit = (w - this.new_reqs_x - border - from_main_q_tracks_w - main_q_storage_space
            - 2 * space) / total_cells;
        this.cell_size = min(cell_size_w_limit, cell_size_h_limit);
        this.req_radius = (this.cell_size - space) / 2;

        this.track_conn_pt_x = null;
        this.track_ends_x = null;
        this.app_q_animation_in_progress = false;
        this.paused = false;
        this.history = [];
        this.stime = null;


        this.qd_label = this.raphael.text(150, 50, `Target QD = ${qd}`).attr({'font-size': fs_large});
        this.atc_qd_label = this.raphael.text(150, 100, `Actual QD = --`).attr({'font-size': fs_large});
        this.rps_label = this.raphael.text(150, 150, "RPS = ---").attr({'font-size': fs_large});
        this.lat_label = this.raphael.text(150, 200, "LAT = ---").attr({'font-size': fs_large});
        this.track_start_x = this.draw_app_queue(this.new_reqs_x) + space;
        this.queues_start_x = this.draw_tracks(this.track_start_x) + space;
        this.queues_end_x = this.queues_start_x + this.cell_size * q_cells;
        this.storage_start_x = this.draw_queues(this.queues_start_x) + main_q_storage_space;
        this.draw_storage(this.storage_start_x);
        this.draw_heads(this.storage_start_x);
    }

    set_key_handlers() {
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
    }

    mainloop() {
        this.stime = new Date().getTime() / 1000;
        this.set_key_handlers();

        setInterval(() => {produce_req_loop(this)}, produce_loop_timeout);
        setInterval(() => {move_input_requests_loop(this)}, move_input_req_loop_tout);

        for(const exec of this.storage.execs)
            process_requests_loop(this, exec);
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

    // draw/update requests & storage values
    draw_req(req, x, y) {
        const circle = this.raphael.circle(x, y, this.req_radius);
        const rtext = this.raphael.text(x, y, req.value);
        rtext.attr({"font-size": fs_normal});

        const color = Raphael.hsb(req.queue / this.unit_count, req.offset / this.size / 1.5 + 0.1666, 1);
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
        this.raphael.mline(x, this.vcenter, this.track_conn_pt_x, this.vcenter);
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
            const color = Raphael.hsb(idx / this.unit_count, 0.2, 1);

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



function produce_req_loop(scene) {
    if (!scene.paused && !scene.app_q_animation_in_progress) {
        if (scene.total_active_reqs < scene.qd && scene.app_q_reqs.length < app_q_cells) {
            let req = new IORequest(scene.cvalue, rand_int(scene.unit_count), rand_int(scene.size));
            scene.draw_req(req,
                scene.new_reqs_x + (app_q_cells - scene.app_q_reqs.length - 0.5) * scene.cell_size,
                scene.vcenter);
            scene.app_q_reqs.push(req);
            scene.cvalue += rand_int(5);
            scene.total_active_reqs++;
        }
    }
}


function move_input_requests_loop(scene) {
    if (!scene.paused && !!scene.app_q_reqs.length) {
        // move first request over the bus
        const req = scene.app_q_reqs[0];
        scene.app_q_reqs.shift();

        const pts = [scene.track_start_x, scene.vcenter,
            scene.track_conn_pt_x, scene.vcenter,
            scene.track_conn_pt_x, scene.storages_v_centers[req.queue],
            scene.track_ends_x, scene.storages_v_centers[req.queue]];

        animate_on_points(req, pts, move_speed, () => {
            const exec = scene.storage.execs[req.queue];
            exec.send(req);
            scene.update_q_req_pos(exec);
        });

        // shift other requests in queue
        if (!!scene.app_q_reqs.length) {
            for (const rr of scene.app_q_reqs.slice(0, -1)) {
                const [x, y] = rr.get_xy();
                rr.move(x + scene.cell_size, y, request_shift_time);
                scene.app_q_animation_in_progress = true;
            }
            let rr = last(scene.app_q_reqs);
            const [x, y] = rr.get_xy();
            rr.move(x + scene.cell_size, y, request_shift_time, () => {scene.app_q_animation_in_progress = false});
        }
    }
}

function process_requests_loop(scene, exec) {
    let request_in_flight = false;
    let head_move_left = null;
    const head_step_max = 10;

    function cl() {
        if (scene.paused) {
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
                head_move_left = (exec.position - old_head_pos) * scene.cell_size;
                setTimeout(cl, process_loop_tout_hmove);
                return;
            }

            // requests executed
            if (!!req) {
                // move request to head, then update storage value in cell
                const [x, y] = req.get_xy();
                req.r_obj.attr({"opacity": 1.0});
                animate_on_points(req, [
                    x, y - scene.cell_size,
                    scene.storage_start_x + exec.position * scene.cell_size - scene.cell_size / 2, y - scene.cell_size
                ], move_speed2, () => {
                    req.r_obj.remove();
                    scene.sync_sqstorage_vals(exec);
                    request_in_flight = false;
                    exec.r_texts[req.offset].attr({"fill": "#F66", "font-size": fs_normal_plus});
                    exec.r_texts[req.offset].animate({"fill": "#000", "font-size": fs_normal}, text_color_tout);
                });
                request_in_flight = true;
                // move all other requests in the queue
                let xpos = scene.queues_start_x + scene.cell_size / 2;
                for (const req of exec.all_req()) {
                    let [cx, cy] = req.get_xy();
                    if (cx !== xpos)
                        req.move(xpos, cy, request_shift_time);
                    xpos += scene.cell_size;
                }
                scene.total_active_reqs--;
                scene.on_req_done(req);
            } else {
                scene.on_req_done(null);
            }
            setTimeout(cl, process_loop_tout);
        } else {
            setTimeout(cl, process_loop_tout_short);
        }
    }
    cl();
}