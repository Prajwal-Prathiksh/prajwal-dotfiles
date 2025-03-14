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

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import psutil
from tqdm import tqdm


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

    dates = [datetime.datetime.fromisoformat(d[0]) for d in data]
    x = mdates.date2num(dates)
    y = [float(d[1]) for d in data]

    start = (dates[0], y[0])
    end = (dates[-1], y[-1])
    duration = end[0] - start[0]
    duration = duration.total_seconds()
    avg_usage = (start[1] - end[1]) / duration
    # convert to percentage per minute
    avg_usage *= 60.0

    # estimate time for full depletion
    time_to_empty = 100 / avg_usage
    # convert to hours and minutes
    time_to_empty = divmod(time_to_empty, 60)
    time_to_empty = f"{int(time_to_empty[0])}h {int(time_to_empty[1])}m"

    plt.figure(figsize=(10, 5))
    plt.plot(x, y, marker="o")
    plt.gca().xaxis.set_major_formatter(mdates.DateFormatter("%H:%M:%S"))
    plt.xlabel("Time")
    plt.ylabel("Battery Percentage")
    plt.title(
        f"Battery Percentage vs Time | Avg Usage: {avg_usage:.2f}%/m | Battery Backup (100%): {time_to_empty}"
    )
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
