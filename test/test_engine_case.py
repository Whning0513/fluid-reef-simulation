import importlib.util
import math
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR_PATH = ROOT / "engine" / "dualsphysics" / "generate_case.py"
SPEC = importlib.util.spec_from_file_location("generate_case", GENERATOR_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class DualSphysicsCaseTests(unittest.TestCase):
    def test_actuator_is_annular_and_always_submerged(self):
        highest_top = (
            MODULE.ACTUATOR_REST_Z
            + MODULE.ACTUATOR_AMPLITUDE
            + MODULE.ACTUATOR_HEIGHT / 2
        )
        self.assertAlmostEqual(MODULE.ACTUATOR_OUTER_RADIUS, 0.10)
        self.assertAlmostEqual(MODULE.ACTUATOR_INNER_RADIUS, 0.06)
        self.assertAlmostEqual(MODULE.ACTUATOR_HEIGHT, 0.10)
        self.assertLess(highest_top, MODULE.WATER_LEVEL)

    def test_rear_reef_rises_toward_negative_y_and_emerges(self):
        near = MODULE.rear_reef_height(0.0, -0.55)
        far = MODULE.rear_reef_height(0.0, -0.95)
        self.assertGreater(far, near)
        self.assertGreater(far, 0.0)

    def test_generated_xml_uses_high_fidelity_solver_settings(self):
        xml = ET.fromstring(MODULE.case_xml(0.02, 8.0, 0.025))
        parameters = {
            item.attrib["key"]: item.attrib["value"]
            for item in xml.findall("./execution/parameters/parameter")
        }
        self.assertEqual(parameters["SavePosDouble"], "1")
        self.assertEqual(parameters["Boundary"], "2")
        self.assertEqual(parameters["StepAlgorithm"], "2")
        self.assertEqual(parameters["Kernel"], "2")
        motion = xml.find("./casedef/motion/objreal/mvrectsinu")
        self.assertIsNotNone(motion)
        self.assertEqual(motion.find("freq").attrib["z"], "1.200000")
        self.assertEqual(motion.find("ampl").attrib["z"], "0.085000")
        point_cloud = xml.find("./casedef/geometry/commands/mainlist/drawpoints")
        self.assertIsNotNone(point_cloud)
        self.assertGreater(len(point_cloud.findall("point")), 300)

    def test_actuator_boundary_point_cloud_preserves_exact_extents(self):
        points = MODULE.actuator_boundary_points(0.02)
        radii = [math.hypot(x, y) for x, y, _ in points]
        heights = [z for _, _, z in points]
        self.assertAlmostEqual(min(radii), 0.06, places=8)
        self.assertAlmostEqual(max(radii), 0.10, places=8)
        self.assertAlmostEqual(min(heights), -0.27, places=8)
        self.assertAlmostEqual(max(heights), -0.17, places=8)

    def test_meshes_are_closed_binary_stl_surfaces(self):
        meshes = {
            "west": MODULE.tube_mesh(MODULE.catmull_rom(MODULE.LEG_REEFS[0]), 0.105),
            "east": MODULE.tube_mesh(MODULE.catmull_rom(MODULE.LEG_REEFS[1]), 0.105),
            "rear": MODULE.rear_reef_mesh(),
            "actuator": MODULE.annular_cylinder_mesh(),
        }
        for name, mesh in meshes.items():
            self.assertGreater(len(mesh.triangles), 100, name)
            for triangle in mesh.triangles:
                area_vector = MODULE.cross(
                    MODULE.sub(triangle[1], triangle[0]),
                    MODULE.sub(triangle[2], triangle[0]),
                )
                self.assertGreater(math.sqrt(MODULE.dot(area_vector, area_vector)), 1e-12, name)


if __name__ == "__main__":
    unittest.main()
