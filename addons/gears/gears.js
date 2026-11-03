// Gear Generator — the mount. Fields on the left, a live preview on the right, the shared save
// panel at the bottom of the fields column. Every number comes from gears_core.js (tested under
// node); this file only wires fields to a debounced render and the save panel's collect/load.
//
// `host` is never imported here: the save panel reads it at call time (docs/addon-api-v1.md §3),
// and nothing else in this tool needs the SDK. Host classes only (.box-field, .box-field-label,
// .btn, .muted, .box-preview-status); a `style` attribute where none fits; never a <style> block.
import { h, layout, number, select, status, debounce, fmt } from "./lib/ui.js";
import { renderMesh, fitCanvas } from "./lib/preview3d.js";
import { mountSavePanel } from "./lib/save_panel.js";
import { slug, MAX_BYTES } from "./lib/save_helpers.js";
import { toBinaryStl } from "./lib/mesh.js";
import { defaults, validateParams, spurGear, rack, gearSvg, gearMesh } from "./gears_core.js";

const STL_HEADER_BYTES = 84;
const STL_TRIANGLE_BYTES = 50;

const stlBytes = (mesh) => STL_HEADER_BYTES + STL_TRIANGLE_BYTES * mesh.faces.length;

const withSeparators = (n) => n.toLocaleString("en-US");

export default {
  mount(el, ctx) {
    const { side, preview } = layout(el);
    const params = defaults();
    const fields = {};

    // ---- fields -------------------------------------------------------------------------------
    const onChange = (key) => (v) => { params[key] = key === "kind" || key === "output" ? v : Number(v); refresh(); };

    fields.kind = select({
      label: "Kind",
      options: [{ value: "spur", label: "Spur gear" }, { value: "rack", label: "Rack" }, { value: "pair", label: "Meshing pair" }],
      value: params.kind,
      onChange: onChange("kind"),
    });
    fields.module = number({ label: "Module", value: params.module, min: 0.1, max: 50, step: 0.25, unit: "mm", onChange: onChange("module") });
    fields.teeth = number({ label: "Teeth", value: params.teeth, min: 6, max: 400, step: 1, onChange: onChange("teeth") });
    fields.teeth2 = number({ label: "Teeth of gear 2", value: params.teeth2, min: 6, max: 400, step: 1, onChange: onChange("teeth2") });
    fields.pressureAngleDeg = select({
      label: "Pressure angle",
      options: [{ value: "20", label: "20°" }, { value: "14.5", label: "14.5°" }],
      value: params.pressureAngleDeg,
      onChange: onChange("pressureAngleDeg"),
    });
    fields.bore = number({ label: "Bore", value: params.bore, min: 0, step: 0.5, unit: "mm", onChange: onChange("bore") });
    fields.hub = number({ label: "Hub circle (engraved, 0 = none)", value: params.hub, min: 0, step: 0.5, unit: "mm", onChange: onChange("hub") });
    fields.length = number({ label: "Length", value: params.length, min: 1, step: 1, unit: "mm", onChange: onChange("length") });
    fields.height = number({ label: "Height below the pitch line", value: params.height, min: 0.5, step: 0.5, unit: "mm", onChange: onChange("height") });
    fields.thickness = number({ label: "Thickness (STL)", value: params.thickness, min: 0.1, step: 0.5, unit: "mm", onChange: onChange("thickness") });
    fields.output = select({
      label: "Output",
      options: [{ value: "svg", label: "SVG (laser)" }, { value: "stl", label: "STL (printer)" }, { value: "both", label: "SVG and STL" }],
      value: params.output,
      onChange: onChange("output"),
    });

    const info = h("p", { class: "muted", style: "margin: 4px 0 0; font-size: 13px;" });
    const problems = status();
    const saveEl = h("div", { style: "margin-top: 16px;" });

    side.append(
      fields.kind.el, fields.module.el, fields.teeth.el, fields.teeth2.el, fields.pressureAngleDeg.el,
      fields.bore.el, fields.hub.el, fields.length.el, fields.height.el, fields.thickness.el, fields.output.el,
      info, problems.el, saveEl,
    );

    // ---- preview ------------------------------------------------------------------------------
    // The SVG is the saved document inlined; its mm width/height attributes are dropped on the
    // preview copy only, so a 300 mm gear scales to the column instead of overflowing it. The
    // canvas gets a CSS box here and fitCanvas sizes its backing store to it.
    const svgBox = h("div", { style: "background: #fff; border-radius: 6px; padding: 8px; line-height: 0;" });
    const canvas = h("canvas", { style: "display: block; width: 100%; height: 360px; background: #fff; border-radius: 6px;" });
    preview.append(svgBox, canvas);

    const showFields = () => {
      const kind = params.kind;
      const stl = params.output !== "svg";
      fields.teeth.el.style.display = kind === "rack" ? "none" : "";
      fields.teeth2.el.style.display = kind === "pair" ? "" : "none";
      fields.bore.el.style.display = kind === "rack" ? "none" : "";
      fields.hub.el.style.display = kind === "rack" ? "none" : "";
      fields.length.el.style.display = kind === "rack" ? "" : "none";
      fields.height.el.style.display = kind === "rack" ? "" : "none";
      fields.thickness.el.style.display = stl ? "" : "none";
      svgBox.style.display = params.output === "stl" ? "none" : "";
      canvas.style.display = stl ? "" : "none";
    };

    const describe = () => {
      const m = params.module;
      if (params.kind === "rack") {
        const r = rack({ module: m, length: params.length, pressureAngleDeg: params.pressureAngleDeg, height: params.height });
        return `Pitch ${fmt(r.pitch)} mm · ${r.teeth} teeth · ${fmt(params.length)} × ${fmt(r.tipY)} mm overall`;
      }
      const g = spurGear({ module: m, teeth: params.teeth, pressureAngleDeg: params.pressureAngleDeg });
      let line = `Pitch Ø ${fmt(2 * g.pitchRadius)} mm · outer Ø ${fmt(2 * g.outerRadius)} mm · root Ø ${fmt(2 * g.rootRadius)} mm`;
      if (params.kind === "pair") {
        const g2 = spurGear({ module: m, teeth: params.teeth2, pressureAngleDeg: params.pressureAngleDeg });
        line = `Gear 1 pitch Ø ${fmt(2 * g.pitchRadius)} mm, outer Ø ${fmt(2 * g.outerRadius)} mm · ` +
          `gear 2 pitch Ø ${fmt(2 * g2.pitchRadius)} mm, outer Ø ${fmt(2 * g2.outerRadius)} mm · ` +
          `centre distance ${fmt((m * (params.teeth + params.teeth2)) / 2)} mm · ratio ${fmt(params.teeth2 / params.teeth, 3)}:1`;
      }
      return line;
    };

    // Builds what the current params describe, or throws the first validation message. The same
    // function serves the preview and the save, so what is shown is what is saved.
    const build = () => {
      const messages = validateParams(params);
      if (messages.length) throw new Error(messages[0]);
      const out = { svg: null, mesh: null };
      if (params.output !== "stl") out.svg = gearSvg(params, { kind: params.kind });
      if (params.output !== "svg") {
        out.mesh = gearMesh(params, params.thickness, { kind: params.kind });
        const bytes = stlBytes(out.mesh);
        if (bytes > MAX_BYTES) {
          throw new Error(`This STL would be ${withSeparators(bytes)} bytes (${withSeparators(out.mesh.faces.length)} triangles); ` +
            `a save can hold at most ${withSeparators(MAX_BYTES)} bytes. Use fewer teeth or a smaller module.`);
        }
      }
      return out;
    };

    const render = () => {
      showFields();
      let built;
      try {
        built = build();
      } catch (e) {
        problems.set(e.message, "error");
        info.textContent = "";
        return;
      }
      problems.set("");
      info.textContent = describe();
      if (built.svg) {
        svgBox.innerHTML = built.svg;
        const svg = svgBox.querySelector("svg");
        if (svg) {
          svg.removeAttribute("width");
          svg.removeAttribute("height");
          svg.setAttribute("style", "width: 100%; height: auto; max-height: 70vh; display: block;");
        }
      } else {
        svgBox.innerHTML = "";
      }
      if (built.mesh) {
        fitCanvas(canvas);
        renderMesh(canvas, built.mesh);
      }
    };
    const refresh = debounce(render, 150);

    // ---- save ---------------------------------------------------------------------------------
    const collect = (name) => {
      const built = build(); // throws the first validation message; the panel shows it
      const base = slug(name) || "gear";
      const files = [];
      if (built.svg) files.push({ name: `${base}.svg`, contentType: "image/svg+xml", body: built.svg });
      if (built.mesh) files.push({ name: `${base}.stl`, contentType: "model/stl", body: toBinaryStl(built.mesh, name) });
      return { name, data: { ...params }, files };
    };

    const load = (data) => {
      const next = { ...defaults(), ...(data || {}) };
      for (const key of Object.keys(params)) {
        params[key] = next[key];
        if (fields[key]) fields[key].set(next[key]);
      }
      refresh.cancel();
      render();
    };

    mountSavePanel(saveEl, ctx, {
      collect,
      load,
      defaultName: params.kind === "rack" ? "rack" : `gear m${params.module} z${params.teeth}`,
    });

    render();
  },
};
