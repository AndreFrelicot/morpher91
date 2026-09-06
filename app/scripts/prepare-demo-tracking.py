#!/usr/bin/env python3
"""Prepare offline landmark tracks. Requires OpenCV and NumPy, no network at runtime.

Input directory contains Vision JSON (analyze-demo-video.swift) and decoded JPEG
frames under frames/{claire,anna,cop,karl}-001.jpg. Robot anchors are reviewed
manually; LK flow is computed in both directions between each pair of anchors.
Run: python prepare-demo-tracking.py /path/to/analysis-directory
"""
import json
import sys
from pathlib import Path
import cv2
import numpy as np

APP = Path(__file__).resolve().parents[1]
OUT = APP / 'scripts/demo-authoring/tracking'
RAW = Path(sys.argv[1])


def read(name):
    return json.loads((RAW / (name + '.json')).read_text())


def xy(value):
    return [round(float(v), 6) for v in value[:2]]


def face_points(frame):
    face = frame['face']
    points = {}
    for i in range(0, 17, 2):
        points['chin' if i == 8 else f'jaw{i:02}'] = xy(face['contour'][i])
    for side in ['left', 'right']:
        for i, p in enumerate(face[side + 'Eye']):
            points[f'{side}Eye{i}'] = xy(p)
        for i in [0, 2]:
            points[f'{side}Brow{i}'] = xy(face[side + 'Brow'][i])
    for i in [0, 2, 4, 6]:
        points['nose' if i == 4 else f'nose{i}'] = xy(face['nose'][i])
    points['noseBridge'] = xy(face['noseCrest'][0])
    for i, p in enumerate(face['outerLips']):
        key = {0: 'mouthL', 6: 'mouthR', 3: 'lipTop', 10: 'lipBottom'}.get(i, f'lip{i:02}')
        points[key] = xy(p)
    return points


def face_region(frame):
    f = frame['face']
    # Complete the detected cheek/chin arc with an upper forehead arc.
    contour = f['contour']
    left = np.mean(f['leftBrow'], axis=0)
    right = np.mean(f['rightBrow'], axis=0)
    upper = (left + right) / 2
    upper[1] -= np.linalg.norm(left - right) * .75
    return [xy(v) for v in contour[::2]] + [xy(left - [0, .05]), xy(upper), xy(right - [0, .05])]


def pose_points(frame):
    pose = frame['pose']
    f = frame['face']
    result = {
        'eyeL': xy(np.mean(f['leftEye'], axis=0)),
        'eyeR': xy(np.mean(f['rightEye'], axis=0)),
        'nose': xy(f['nose'][4]), 'chin': xy(f['contour'][8]),
    }
    joints = {'shoulder': 'shoulder_1', 'elbow': 'forearm', 'wrist': 'hand',
              'hip': 'upLeg', 'knee': 'leg', 'ankle': 'foot'}
    for key, name in joints.items():
        # L/R refer to the initial image side, never sorted again as legs cross.
        for side, vision in [('L', 'right'), ('R', 'left')]:
            joint = pose[f'{vision}_{name}_joint']
            if joint[2] < .4:
                raise ValueError(f'Unreliable cop joint: {key}{side} at {frame["timeSec"]}')
            result[key + side] = xy(joint)
    return result


def robot_flow():
    anchors = json.loads((OUT / 'robot-anchors.json').read_text())
    keys = anchors['keys']
    images = [cv2.imread(str(p), cv2.IMREAD_GRAYSCALE) for p in sorted((RAW / 'frames').glob('karl-*.jpg'))]
    height, width = images[0].shape
    scale = np.array([width / anchors['size'][0], height / anchors['size'][1]])
    refs = {int(t): np.asarray(values, np.float32) * scale for t, values in anchors['frames'].items()}
    output = np.zeros((len(images), len(keys), 2), np.float32)
    rejected = 0
    params = dict(winSize=(41, 41), maxLevel=3,
                  criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 40, .005))

    def propagate(start, stop, initial):
        nonlocal rejected
        step = 1 if stop > start else -1
        current = initial.astype(np.float32).reshape(-1, 1, 2)
        found = {start: (current[:, 0].copy(), np.ones(len(keys), bool))}
        reliable = np.ones(len(keys), bool)
        for i in range(start + step, stop + step, step):
            nxt, status, error = cv2.calcOpticalFlowPyrLK(images[i-step], images[i], current, None, **params)
            back, back_status, _ = cv2.calcOpticalFlowPyrLK(images[i], images[i-step], nxt, None, **params)
            valid = ((status[:, 0] == 1) & (back_status[:, 0] == 1)
                     & (np.linalg.norm(back[:, 0] - current[:, 0], axis=1) < 2.5)
                     & (np.linalg.norm(nxt[:, 0] - current[:, 0], axis=1) < 35))
            reliable &= valid
            rejected += int(np.sum(~valid))
            found[i] = (nxt[:, 0].copy(), reliable.copy())
            current = nxt
        return found

    times = sorted(refs)
    for a, b in zip(times, times[1:]):
        forward = propagate(a, b, refs[a])
        backward = propagate(b, a, refs[b])
        for i in range(a, b + 1):
            u = (i-a)/(b-a)
            fp, fv = forward[i]; bp, bv = backward[i]
            linear = (1-u)*refs[a] + u*refs[b]
            combined = (1-u)*fp + u*bp
            # Flow cannot override the reviewed geometry with an implausible excursion.
            valid = fv & bv & (np.linalg.norm(fp-bp, axis=1) < 28)
            valid &= np.linalg.norm(combined-linear, axis=1) < 22
            output[i] = np.where(valid[:, None], combined, linear)
        output[a] = refs[a]; output[b] = refs[b]
    print('Robot: reviewed anchors', len(refs), '; rejected LK steps', rejected)
    return [dict(timeSec=round(i/24, 9), points={k: xy(v / [width, height]) for k,v in zip(keys, values)})
            for i, values in enumerate(output)]


data = {}
for name in ['claire', 'anna', 'claire-still']:
    frames = read(name)
    if any('face' not in f for f in frames):
        raise ValueError(f'Missing face detection in {name}')
    data[name] = [dict(timeSec=round(f['timeSec'], 9), points=face_points(f), region=face_region(f)) for f in frames]
data['cop'] = [dict(timeSec=round(f['timeSec'], 9), points=pose_points(f)) for f in read('cop')]
data['karl'] = robot_flow()
for name, frames in data.items():
    (OUT / (name + '.json')).write_text(json.dumps(frames, separators=(',', ':')) + '\n')
    print(name, len(frames), 'frames;', len(frames[0]['points']), 'points/frame')
