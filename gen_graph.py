from matplotlib import pyplot
import seaborn

seaborn.set_style("darkgrid")

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

pyplot.show()
