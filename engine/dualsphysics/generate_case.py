#!/usr/bin/env python3
"""Generate reproducible STL geometry and a DualSPHysics 5.4 case.

The public web demo uses a height field. This case is the engineering-grade path:
three-dimensional WCSPH particles, mDBC solid boundaries, and a prescribed moving
annular boundary. No third-party Python packages are required.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

Vec3 = tuple[float, float, float]

WORLD_MIN = -1.0
WORLD_MAX = 1.0
WATER_LEVEL = 0.0
ACTUATOR_OUTER_RADIUS = 0.10
ACTUATOR_INNER_RADIUS = 0.06
ACTUATOR_HEIGHT = 0.10
ACTUATOR_REST_Z = -0.22
ACTUATOR_AMPLITUDE = 0.085
ACTUATOR_FREQUENCY = 1.20

LEG_REEFS: tuple[tuple[Vec3, ...], ...] = (
    (
        (-0.93, 0.76, -0.58), (-0.84, 0.64, -0.28),
        (-0.72, 0.53, 0.16), (-0.60, 0.43, 0.08),
        (-0.49, 0.34, -0.24), (-0.39, 0.25, -0.56),
    ),
    (
        (0.93, 0.76, -0.58), (0.84, 0.64, -0.28),
        (0.72, 0.53, 0.16), (0.60, 0.43, 0.08),
        (0.49, 0.34, -0.24), (0.39, 0.25, -0.56),
    ),
)


def add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a: Vec3, scale: float) -> Vec3:
    return (a[0] * scale, a[1] * scale, a[2] * scale)


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def normalized(a: Vec3) -> Vec3:
    length = math.sqrt(dot(a, a))
    if length < 1e-12:
        return (0.0, 0.0, 1.0)
    return mul(a, 1.0 / length)


@dataclass
class Mesh:
    triangles: list[tuple[Vec3, Vec3, Vec3]] = field(default_factory=list)

    def tri(self, a: Vec3, b: Vec3, c: Vec3) -> None:
        self.triangles.append((a, b, c))

    def quad(self, a: Vec3, b: Vec3, c: Vec3, d: Vec3) -> None:
        self.tri(a, b, c)
        self.tri(a, c, d)

    def write_binary_stl(self, path: Path, label: str) -> None:
        header = label.encode("ascii", "replace")[:80].ljust(80, b"\0")
        with path.open("wb") as stream:
            stream.write(header)
            stream.write(struct.pack("<I", len(self.triangles)))
            for a, b, c in self.triangles:
                normal = normalized(cross(sub(b, a), sub(c, a)))
                stream.write(struct.pack("<12fH", *normal, *a, *b, *c, 0))


def catmull_rom(points: tuple[Vec3, ...], subdivisions: int = 10) -> list[Vec3]:
    result: list[Vec3] = []
    padded = (points[0],) + points + (points[-1],)
    for segment in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[segment - 1:segment + 3]
        for step in range(subdivisions):
            t = step / subdivisions
            t2, t3 = t * t, t * t * t
            coordinates = []
            for axis in range(3):
                value = 0.5 * (
                    2 * p1[axis]
                    + (-p0[axis] + p2[axis]) * t
                    + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2
                    + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
                )
                coordinates.append(value)
            result.append(tuple(coordinates))
    result.append(points[-1])
    return result


def tube_mesh(centerline: Iterable[Vec3], radius: float, sides: int = 20) -> Mesh:
    centers = list(centerline)
    rings: list[list[Vec3]] = []
    previous_normal: Vec3 | None = None
    for index, center in enumerate(centers):
        before = centers[max(0, index - 1)]
        after = centers[min(len(centers) - 1, index + 1)]
        tangent = normalized(sub(after, before))
        if previous_normal is None:
            reference = (0.0, 0.0, 1.0) if abs(tangent[2]) < 0.85 else (0.0, 1.0, 0.0)
            normal = normalized(cross(tangent, reference))
        else:
            # Parallel-transport the previous normal onto the new normal plane.
            normal = normalized(sub(previous_normal, mul(tangent, dot(previous_normal, tangent))))
        binormal = normalized(cross(tangent, normal))
        previous_normal = normal
        ring = []
        for side in range(sides):
            angle = 2 * math.pi * side / sides
            radial = add(mul(normal, math.cos(angle)), mul(binormal, math.sin(angle)))
            roughness = 1.0 + 0.055 * math.sin(index * 1.71 + side * 2.37)
            ring.append(add(center, mul(radial, radius * roughness)))
        rings.append(ring)

    mesh = Mesh()
    for index in range(len(rings) - 1):
        for side in range(sides):
            nxt = (side + 1) % sides
            mesh.quad(rings[index][side], rings[index + 1][side], rings[index + 1][nxt], rings[index][nxt])
    for side in range(sides):
        nxt = (side + 1) % sides
        mesh.tri(centers[0], rings[0][nxt], rings[0][side])
        mesh.tri(centers[-1], rings[-1][side], rings[-1][nxt])
    return mesh


def rear_reef_height(x: float, y: float) -> float:
    t = min(1.0, max(0.0, (-y - 0.5) / 0.5))
    q = min(1.0, abs(x) / 0.60)
    crown = max(0.0, 1.0 - q**3.2) ** 0.55
    texture = 0.012 * math.sin(21 * x + 13 * y) * math.sin(9 * x - 17 * y)
    return -0.22 + 0.78 * t**1.18 * crown - 0.08 * q * q + texture * (1 - q)


def rear_reef_mesh(nx: int = 61, ny: int = 31) -> Mesh:
    top: list[list[Vec3]] = []
    for j in range(ny):
        y = -1.0 + 0.5 * j / (ny - 1)
        row = []
        for i in range(nx):
            x = -0.60 + 1.20 * i / (nx - 1)
            row.append((x, y, rear_reef_height(x, y)))
        top.append(row)

    mesh = Mesh()
    for j in range(ny - 1):
        for i in range(nx - 1):
            mesh.quad(top[j][i], top[j + 1][i], top[j + 1][i + 1], top[j][i + 1])

    bottom_z = -1.0
    perimeter = (
        [top[0][i] for i in range(nx)]
        + [top[j][-1] for j in range(1, ny)]
        + [top[-1][i] for i in range(nx - 2, -1, -1)]
        + [top[j][0] for j in range(ny - 2, 0, -1)]
    )
    for index, upper in enumerate(perimeter):
        upper_next = perimeter[(index + 1) % len(perimeter)]
        lower = (upper[0], upper[1], bottom_z)
        lower_next = (upper_next[0], upper_next[1], bottom_z)
        mesh.quad(upper, lower, lower_next, upper_next)
    mesh.quad((-0.60, -1.0, bottom_z), (-0.60, -0.5, bottom_z),
              (0.60, -0.5, bottom_z), (0.60, -1.0, bottom_z))
    return mesh


def annular_cylinder_mesh(segments: int = 72) -> Mesh:
    mesh = Mesh()
    low = ACTUATOR_REST_Z - ACTUATOR_HEIGHT / 2
    high = ACTUATOR_REST_Z + ACTUATOR_HEIGHT / 2
    for index in range(segments):
        a0 = 2 * math.pi * index / segments
        a1 = 2 * math.pi * (index + 1) / segments
        outer0 = (ACTUATOR_OUTER_RADIUS * math.cos(a0), ACTUATOR_OUTER_RADIUS * math.sin(a0))
        outer1 = (ACTUATOR_OUTER_RADIUS * math.cos(a1), ACTUATOR_OUTER_RADIUS * math.sin(a1))
        inner0 = (ACTUATOR_INNER_RADIUS * math.cos(a0), ACTUATOR_INNER_RADIUS * math.sin(a0))
        inner1 = (ACTUATOR_INNER_RADIUS * math.cos(a1), ACTUATOR_INNER_RADIUS * math.sin(a1))
        o0l, o1l = (*outer0, low), (*outer1, low)
        o0h, o1h = (*outer0, high), (*outer1, high)
        i0l, i1l = (*inner0, low), (*inner1, low)
        i0h, i1h = (*inner0, high), (*inner1, high)
        mesh.quad(o0l, o1l, o1h, o0h)
        mesh.quad(i0l, i0h, i1h, i1l)
        mesh.quad(o0h, o1h, i1h, i0h)
        mesh.quad(o0l, i0l, i1l, o1l)
    return mesh


def actuator_boundary_points(dp: float) -> list[Vec3]:
    """Sample the annular solid directly as a near-uniform SPH boundary cloud."""
    radial_steps = max(2, math.ceil((ACTUATOR_OUTER_RADIUS - ACTUATOR_INNER_RADIUS) / dp))
    vertical_steps = max(2, math.ceil(ACTUATOR_HEIGHT / dp))
    points: list[Vec3] = []
    for iz in range(vertical_steps + 1):
        z = ACTUATOR_REST_Z - ACTUATOR_HEIGHT / 2 + ACTUATOR_HEIGHT * iz / vertical_steps
        for ir in range(radial_steps + 1):
            radius = ACTUATOR_INNER_RADIUS + (ACTUATOR_OUTER_RADIUS - ACTUATOR_INNER_RADIUS) * ir / radial_steps
            angular_steps = max(12, round(2 * math.pi * radius / dp))
            phase = (iz % 2) * math.pi / angular_steps
            for ia in range(angular_steps):
                angle = 2 * math.pi * ia / angular_steps + phase
                points.append((radius * math.cos(angle), radius * math.sin(angle), z))
    return points


def write_points_vtk(path: Path, points: list[Vec3], label: str) -> None:
    lines = [
        "# vtk DataFile Version 3.0",
        label,
        "ASCII",
        "DATASET POLYDATA",
        f"POINTS {len(points)} float",
    ]
    lines.extend(f"{x:.9f} {y:.9f} {z:.9f}" for x, y, z in points)
    path.write_text("\n".join(lines) + "\n", encoding="ascii")


def case_xml(dp: float, duration: float, output_dt: float) -> str:
    actuator_xml = "\n".join(
        f'            <point x="{x:.9f}" y="{y:.9f}" z="{z:.9f}" />'
        for x, y, z in actuator_boundary_points(dp)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" ?>
<case>
  <casedef>
    <constantsdef>
      <gravity x="0" y="0" z="-9.81" comment="Gravitational acceleration" />
      <rhop0 value="1000" comment="Reference density of water" />
      <rhopgradient value="2" />
      <hswl value="0" auto="false" />
      <gamma value="7" />
      <speedsystem value="3.132092" auto="false" comment="sqrt(g * 1 m water depth)" />
      <coefsound value="20" />
      <speedsound value="62.641840" auto="false" comment="20 * speedsystem" />
      <coefh value="1.0" />
      <cflnumber value="0.2" />
    </constantsdef>
    <mkconfig boundcount="32" fluidcount="4" />
    <geometry>
      <definition dp="{dp:.6f}">
        <pointmin x="-1.08" y="-1.08" z="-1.08" />
        <pointmax x="1.08" y="1.08" z="0.40" />
      </definition>
      <commands>
        <mainlist>
          <setshapemode>dp | bound</setshapemode>
          <setdrawmode mode="full" />
          <setmkbound mk="0" />
          <drawbox>
            <boxfill>bottom | left | right | front | back</boxfill>
            <point x="-1" y="-1" z="-1" />
            <size x="2" y="2" z="1.08" />
          </drawbox>
          <setmkbound mk="1" />
          <drawfilestl file="leg_reef_west.stl" />
          <drawfilestl file="leg_reef_east.stl" />
          <drawfilestl file="rear_reef.stl" />
          <setmkfluid mk="0" />
          <drawbox>
            <boxfill>solid</boxfill>
            <point x="{-1 + dp:.6f}" y="{-1 + dp:.6f}" z="{-1 + dp:.6f}" />
            <size x="{2 - 2 * dp:.6f}" y="{2 - 2 * dp:.6f}" z="{1 - dp:.6f}" />
          </drawbox>
          <setmkbound mk="2" />
          <drawpoints>
{actuator_xml}
          </drawpoints>
          <shapeout file="ReefTankGeometry" />
        </mainlist>
      </commands>
    </geometry>
    <motion>
      <objreal ref="2">
        <begin mov="1" start="0" />
        <mvrectsinu id="1" duration="-1" anglesunits="radians">
          <freq x="0" y="0" z="{ACTUATOR_FREQUENCY:.6f}" units_comment="1/s" />
          <ampl x="0" y="0" z="{ACTUATOR_AMPLITUDE:.6f}" units_comment="metres (m)" />
          <phase x="0" y="0" z="0" units_comment="radians" />
        </mvrectsinu>
      </objreal>
    </motion>
  </casedef>
  <execution>
    <parameters>
      <parameter key="SavePosDouble" value="1" />
      <parameter key="Boundary" value="2" comment="mDBC" />
      <parameter key="SlipMode" value="3" comment="Free-slip mDBC" />
      <parameter key="NoPenetration" value="1" />
      <parameter key="StepAlgorithm" value="2" comment="Symplectic" />
      <parameter key="Kernel" value="2" comment="Wendland" />
      <parameter key="ViscoTreatment" value="2" comment="Laminar + SPS" />
      <parameter key="Visco" value="0.000001" />
      <parameter key="ViscoBoundFactor" value="1" />
      <parameter key="DensityDT" value="2" comment="Fourtakas density diffusion" />
      <parameter key="DensityDTvalue" value="0.1" />
      <parameter key="Shifting" value="1" comment="Ignore boundary" />
      <parameter key="ShiftCoef" value="-2" />
      <parameter key="ShiftTFS" value="2.75" />
      <parameter key="RigidAlgorithm" value="1" />
      <parameter key="CoefDtMin" value="0.05" />
      <parameter key="DtIni" value="0" />
      <parameter key="DtMin" value="0" />
      <parameter key="DtFixed" value="0" />
      <parameter key="DtAllParticles" value="1" />
      <parameter key="TimeMax" value="{duration:.6f}" />
      <parameter key="TimeOut" value="{output_dt:.6f}" />
      <parameter key="PartsOutMax" value="0.01" />
      <parameter key="RhopOutMin" value="700" />
      <parameter key="RhopOutMax" value="1300" />
      <simulationdomain>
        <posmin x="-1.10" y="-1.10" z="-1.10" />
        <posmax x="1.10" y="1.10" z="0.45" />
      </simulationdomain>
    </parameters>
  </execution>
</case>
'''


def validate_arguments(dp: float, duration: float, output_dt: float) -> None:
    if not 0.008 <= dp <= 0.05:
        raise ValueError("dp must be between 0.008 and 0.05 metres")
    if duration <= 0 or output_dt <= 0 or output_dt > duration:
        raise ValueError("duration and output interval must be positive and ordered")
    actuator_top = ACTUATOR_REST_Z + ACTUATOR_AMPLITUDE + ACTUATOR_HEIGHT / 2
    if actuator_top >= WATER_LEVEL:
        raise ValueError("actuator would emerge from the water")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dp", type=float, default=0.020, help="particle spacing in metres")
    parser.add_argument("--duration", type=float, default=8.0, help="simulation duration in seconds")
    parser.add_argument("--output-dt", type=float, default=0.025, help="output interval in seconds")
    args = parser.parse_args()
    validate_arguments(args.dp, args.duration, args.output_dt)

    root = Path(__file__).resolve().parent
    case_dir = root / "case"
    case_dir.mkdir(parents=True, exist_ok=True)

    meshes = {
        "leg_reef_west.stl": tube_mesh(catmull_rom(LEG_REEFS[0]), 0.105),
        "leg_reef_east.stl": tube_mesh(catmull_rom(LEG_REEFS[1]), 0.105),
        "rear_reef.stl": rear_reef_mesh(),
        "annular_actuator.stl": annular_cylinder_mesh(),
    }
    for filename, mesh in meshes.items():
        mesh.write_binary_stl(case_dir / filename, filename.removesuffix(".stl"))
    boundary_points = actuator_boundary_points(args.dp)
    write_points_vtk(case_dir / "annular_actuator_particles.vtk", boundary_points, "annular actuator boundary particles")

    xml_path = case_dir / "ReefTank_Def.xml"
    xml_path.write_text(case_xml(args.dp, args.duration, args.output_dt), encoding="utf-8")
    approximate_particles = round(4.0 / args.dp**3)
    manifest = {
        "engine": "DualSPHysics 5.4.3",
        "particle_spacing_m": args.dp,
        "approximate_fluid_particles_before_solids": approximate_particles,
        "duration_s": args.duration,
        "output_interval_s": args.output_dt,
        "actuator": {
            "outer_radius_m": ACTUATOR_OUTER_RADIUS,
            "inner_radius_m": ACTUATOR_INNER_RADIUS,
            "height_m": ACTUATOR_HEIGHT,
            "rest_z_m": ACTUATOR_REST_Z,
            "amplitude_m": ACTUATOR_AMPLITUDE,
            "frequency_hz": ACTUATOR_FREQUENCY,
            "highest_top_z_m": ACTUATOR_REST_Z + ACTUATOR_AMPLITUDE + ACTUATOR_HEIGHT / 2,
        },
        "triangle_counts": {name: len(mesh.triangles) for name, mesh in meshes.items()},
        "actuator_boundary_samples": len(boundary_points),
    }
    (case_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Generated {xml_path}")
    print(f"Particle spacing: {args.dp:.4f} m; rough upper estimate: {approximate_particles:,} fluid particles")


if __name__ == "__main__":
    main()
