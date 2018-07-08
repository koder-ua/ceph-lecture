import time
import random
import mmap
import os
from typing import Tuple

def test_speed(qd: int, ttime: float) -> Tuple[float, float]:
    etime = time.time() + ttime
    sz = 190 * (2 ** 20)
    dt = 0
    writes = 0
    with open("/media/data/test.db", "r+b") as fd:
        mm = mmap.mmap(fd.fileno(), 0)
        while time.time() < etime:
            for i in range(qd):
                mm[random.randint(0, sz)] = 123
            t1 = time.perf_counter()
            os.fsync(fd.fileno())
            dt += time.perf_counter() - t1
            writes += qd
    return writes / ttime, dt / (writes / qd)

db_size = 1000000
# create_db()
# fill_data(db_size)

rps1, clat1 = test_speed(50, 5)
# rps10, clat10 = test_speed(10, db_size, 1)
# rps100, clat100 = test_speed(100, db_size, 1)

print(f"   QD      RPS    LAT(ms) ")
print(f"   ~6      {int(rps1):>5d}     {int(clat1 * 1000)}")
# print(f"     10     {int(rps10):>5d}     {int(clat10 * 1000)}")
# print(f"     100    {int(rps100):>5d}     {int(clat100 * 1000)}")


