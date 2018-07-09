function ceph_main() {
    var cnv = document.getElementsByTagName('canvas')[0];
    cnv.width = 300;
    cnv.height = 300;
    var ctx = cnv.getContext('2d');
    ctx.beginPath();
    ctx.rect(0, 0, 200, 200);
    ctx.stroke();
}
ceph_main();
