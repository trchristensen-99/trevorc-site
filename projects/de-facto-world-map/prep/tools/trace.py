#!/usr/bin/env python3
"""Trace a colored area on a map image into GeoJSON, for areas.json.

Most published control maps (Wikipedia's, news graphics) are images. This
fits the image to real coordinates from a few places you can see on it, then
traces every patch of a given color and writes it as lon/lat polygons, ready
for an area recipe like {"file": "zones/name.geojson"}.

    python3 -I tools/trace.py map.png points.json --color "#f0c75e" -o zones/name.geojson

points.json lists at least three places you can locate on the image, by
pixel position and either coordinates or a place name to look up in
OpenStreetMap's geocoder (Nominatim):

    [
      {"px": [455, 702], "lonlat": [35.196, 33.272]},
      {"px": [1412, 537], "place": "Khiam, Lebanon"},
      {"px": [989, 1118], "place": "Bint Jbeil, Lebanon"}
    ]

Spread them across the image. The fit is affine, which is accurate for the
small regions these maps usually cover; it prints each point's error in
metres so you can spot a misplaced one.

Options:
  --color HEX       the area's fill color on the image
  --tolerance N     how far a pixel's color may be from it (CIE Lab distance,
                    default 18); raise it for JPEG noise or shading
  --close N         close gaps (roads, labels, dots drawn over the area) up to
                    N pixels wide (default 15)
  --min-area N      ignore patches smaller than N pixels (default 2000)
  --ignore x0,y0,x1,y1   skip a rectangle, such as an inset map or legend
                    (may be repeated)
  --simplify N      tolerance in pixels for straightening outlines (default 2)

Needs numpy and opencv-python (pip install numpy opencv-python).
"""

import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request

import cv2
import numpy as np


def geocode(place):
    query = urllib.parse.urlencode({"q": place, "format": "json", "limit": 1})
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/search?" + query,
        headers={"User-Agent": "de-facto-world-map-trace/1.0"},
    )
    hits = json.load(urllib.request.urlopen(req))
    time.sleep(1.1)  # Nominatim allows one request a second
    if not hits:
        sys.exit(f"couldn't find {place!r}; give its coordinates as lonlat instead")
    return [float(hits[0]["lon"]), float(hits[0]["lat"])]


def fit(points):
    """Least-squares affine map from lon/lat to pixels, and its inverse."""
    ll = np.array([p["lonlat"] for p in points], float)
    px = np.array([p["px"] for p in points], float)
    a = np.column_stack([ll, np.ones(len(ll))])
    mx, *_ = np.linalg.lstsq(a, px[:, 0], rcond=None)
    my, *_ = np.linalg.lstsq(a, px[:, 1], rcond=None)
    m = np.array([mx[:2], my[:2]])
    b = np.array([mx[2], my[2]])
    # Metres per pixel, for reporting errors.
    lat0 = math.radians(ll[:, 1].mean())
    deg_per_px = np.linalg.inv(m)
    mpp = math.hypot(deg_per_px[0, 0] * 111320 * math.cos(lat0), deg_per_px[1, 0] * 110540)
    for p in points:
        pred = m @ np.array(p["lonlat"]) + b
        err = np.hypot(*(pred - np.array(p["px"])))
        print(f"  {p.get('place', p['lonlat'])}: off by {err:.1f} px ({err * mpp:.0f} m)")
    inv = np.linalg.inv(m)
    return lambda xy: (inv @ (np.asarray(xy, float) - b)).tolist(), mpp


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("points")
    ap.add_argument("--color", required=True)
    ap.add_argument("--tolerance", type=float, default=18)
    ap.add_argument("--close", type=int, default=15)
    ap.add_argument("--min-area", type=float, default=2000)
    ap.add_argument("--ignore", action="append", default=[])
    ap.add_argument("--simplify", type=float, default=2)
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()

    points = json.load(open(args.points))
    if len(points) < 3:
        sys.exit("need at least three points")
    for p in points:
        if "lonlat" not in p:
            p["lonlat"] = geocode(p["place"])
    print("fit:")
    to_lonlat, mpp = fit(points)

    img = cv2.imread(args.image)
    if img is None:
        sys.exit(f"can't read {args.image}")
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(float)
    h = args.color.lstrip("#")
    target = np.uint8([[[int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)]]])
    t = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(float)[0, 0]
    # OpenCV's 8-bit Lab is scaled; undo it so distances are in CIE units.
    scale = np.array([100 / 255, 1, 1])
    dist = np.linalg.norm((lab - t) * scale, axis=2)
    mask = (dist <= args.tolerance).astype(np.uint8) * 255
    for r in args.ignore:
        x0, y0, x1, y1 = map(int, r.split(","))
        mask[y0:y1, x0:x1] = 0
    if args.close:
        k = np.ones((args.close, args.close), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    polys = []
    if hierarchy is not None:
        for i, c in enumerate(contours):
            if hierarchy[0][i][3] != -1 or cv2.contourArea(c) < args.min_area:
                continue
            rings = [c]
            child = hierarchy[0][i][2]
            while child != -1:
                if cv2.contourArea(contours[child]) >= args.min_area / 4:
                    rings.append(contours[child])
                child = hierarchy[0][child][0]
            out = []
            for j, ring in enumerate(rings):
                ring = cv2.approxPolyDP(ring, args.simplify, True)[:, 0, :]
                ll = [[round(v, 5) for v in to_lonlat(p)] for p in ring]
                ll.append(ll[0])
                # GeoJSON winding: outer rings counterclockwise.
                area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ll, ll[1:]))
                if (area < 0) == (j == 0):
                    ll.reverse()
                out.append(ll)
            polys.append(out)
    if not polys:
        sys.exit("no patches of that color found; check --color and --tolerance")
    json.dump(
        {"type": "Feature", "properties": {"traced_from": args.image}, "geometry": {"type": "MultiPolygon", "coordinates": polys}},
        open(args.out, "w"),
    )
    total = sum(cv2.contourArea(c) for c in contours if cv2.contourArea(c) >= args.min_area)
    print(f"wrote {len(polys)} polygon(s), about {total * mpp * mpp / 1e6:.0f} km², to {args.out}")


if __name__ == "__main__":
    main()
