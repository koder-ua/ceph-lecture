import numpy
from matplotlib import pyplot
import seaborn


seaborn.set_style("darkgrid")

def g1():
    QD = list(range(1, 65))
    iops = [150 - 130 / (x / 10 + 1) for x in QD]
    lat = [30 * (66 / (66 - x)) ** 0.3 for x in QD]

    fig, ax1 = pyplot.subplots()
    l1 = ax1.plot(QD, iops, label="IOPS")
    ax1.set_ylabel("IOPS")
    ax1.set_xlabel("QD")

    ax2 = ax1.twinx()
    l2 = ax2.plot(QD, lat, color='red', label="latency")
    ax2.set_ylabel("latency, ms")

    lns = l1 + l2
    labs = [l.get_label() for l in lns]
    ax1.legend(lns, labs, loc=0)


def calc_data():
    block_sizes = 2 ** numpy.arange(12, 30, 0.1)
    QD =    [1,  2,  4, 8, 16, 32]
    LATS = [30, 15, 10, 9,  8,  7]
    BW = 150 * 1024 ** 2

    results = {}

    for lat, qd in zip(LATS, QD):
        op_time = lat * 0.001 + block_sizes / BW
        iops = 1 / op_time
        bw = block_sizes / op_time
        results[qd] = block_sizes, iops, bw
    return results


def bandwith_plot(ax):
    for qd, (szs, _, bws) in calc_data().items():
        ax.plot(szs, bws, label=f"QD={qd}")


def iops_plot(ax):
    for qd, (szs, iops, _) in calc_data().items():
        ax.plot(szs[:100], iops[:100], label=f"QD={qd}")


fig, ax = pyplot.subplots()
iops = False
if iops:
    ax.set_xscale("log", nonposx='clip')
    iops_plot(ax)
else:
    ax.set_xscale("log", nonposx='clip')
    bandwith_plot(ax)

ax.grid(True)
pyplot.legend()
pyplot.show()
