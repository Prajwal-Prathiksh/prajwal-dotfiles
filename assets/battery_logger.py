# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "matplotlib",
#     "psutil",
#     "tqdm"
# ]
# ///

import argparse
import datetime
import time
from pathlib import Path
from tqdm import tqdm

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import psutil


def log_battery(file_path: Path):
    battery = psutil.sensors_battery()
    if battery is None:
        raise Exception("Battery not found")
    percent = battery.percent

    with open(file_path, "a") as f:
        f.write(f"{datetime.datetime.now().isoformat()}, {percent}\n")


def logger(max_loops: int, file_path: Path, sleep_time: int = 1):
    estimated_time = max_loops * sleep_time
    print(f"Monitoring battery level: {max_loops} loops, {estimated_time} seconds")
    print(f"Logging to: {file_path}")
    for _ in tqdm(range(max_loops)):
        log_battery(file_path)
        time.sleep(sleep_time)


def plotter(file_path: Path):
    with open(file_path, "r") as f:
        data = f.readlines()

    data = [d.strip().split(", ") for d in data]

    x = mdates.date2num([datetime.datetime.fromisoformat(d[0]) for d in data])
    y = [float(d[1]) for d in data]

    plt.figure(figsize=(10, 5))
    plt.plot(x, y, marker="o")
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))
    plt.xlabel("Time")
    plt.ylabel("Battery Percentage")
    plt.title("Battery Percentage vs Time")
    plt.grid()
    plt.savefig("battery.png", dpi=300)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Log battery percentage",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("-l", "--loops", type=int, default=10)
    parser.add_argument("-s", "--sleep", type=int, default=10)
    parser.add_argument("-f", "--file", type=Path, default="battery.csv")
    parser.add_argument("-lp", "--log-and-plot", action="store_true")
    parser.add_argument("-p", "--plot-only", action="store_true")
    args = parser.parse_args()

    if args.plot_only:
        plotter(file_path=Path(args.file))
    elif args.log_and_plot:
        logger(max_loops=args.loops, file_path=Path(args.file), sleep_time=args.sleep)
        plotter(file_path=Path(args.file))
    else:
        logger(max_loops=args.loops, file_path=Path(args.file), sleep_time=args.sleep)
