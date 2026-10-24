import Link from "next/link";
export default function Credits() {
  return (
    <div className="asset-credits">
      <p className="eyebrow">The people behind the details</p>
      <h1>A room made together.</h1>
      <p>
        ViralPilot combines original interfaces and architecture with openly
        licensed models. Thank you to the artists who make this possible.
      </p>
      <ul>
        <li>
          <a href="https://sketchfab.com/3d-models/sony-mdr-7506-headphones-05735b74d3524f00b648231138122a28">
            Sony MDR-7506 headphones
          </a>{" "}
          by AndreiVNK —{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
          Scaled and compressed; downloaded through the{" "}
          <a href="https://sceneview.github.io/credits.html">
            SceneView catalogue
          </a>
          .
        </li>
        <li>
          <a href="https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/P/B07B7DL32P.glb">
            Rivet desk, Amazon Berkeley Objects
          </a>{" "}
          by Amazon.com —{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
          Scaled, repositioned and compressed.
        </li>
        <li>
          <a href="https://www.innerscene.com/tools/library/3d-parts/27-inch-monitor-office-technology-961fb20e">
            Monitor
          </a>{" "}
          and{" "}
          <a href="https://www.innerscene.com/tools/library/3d-parts/wireless-mouse-office-technology-7e0e880d">
            mouse
          </a>{" "}
          by Innerscene —{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>.
          Compressed, positioned and materials tuned.
        </li>
        <li>
          <a href="https://github.com/Hanggesimida/keyboard-designer">
            Keyboard Designer
          </a>{" "}
          case and sculpted keycaps by liweihang —{" "}
          <a href="/assets/hardware/KEYBOARD_LICENSE.txt">MIT</a>. Assembled,
          recolored, instanced and compressed; original legends added.
        </li>
        <li>
          <a href="https://polyhaven.com/a/potted_plant_01">Potted plants</a> by
          Rico Cilliers;{" "}
          <a href="https://polyhaven.com/a/desk_lamp_arm_01">lamp</a> by Kuutti
          Siitonen, rig by Yann Kervran;{" "}
          <a href="https://polyhaven.com/a/oak_veneer_01">oak</a> by Jenelle van
          Heerden;{" "}
          <a href="https://polyhaven.com/a/photo_studio_loft_hall">
            HDR environment
          </a>{" "}
          by Sergej Majboroda —{" "}
          <a href="https://polyhaven.com/license">Poly Haven CC0</a>. Prepared,
          compressed and composed for this scene.
        </li>
        <li>
          <a href="https://skiper-ui.com/r/skiper40.json">Link interaction</a>{" "}
          by @gurvinder-singh02 / Skiper UI. Adapted with keyboard and
          reduced-motion support.
        </li>
      </ul>
      <p>
        Architecture, desk accessories, analytics illustrations, demo footage
        and interface code were authored for ViralPilot. The mountain backdrop
        is an original generated image. Full provenance and changes are recorded
        in ASSET_NOTICES.md and the asset manifests. Platform names identify
        illustrative interfaces; no affiliation or endorsement is implied.
      </p>
      <Link className="button button-dark" href="/">
        Back to the room
      </Link>
    </div>
  );
}
