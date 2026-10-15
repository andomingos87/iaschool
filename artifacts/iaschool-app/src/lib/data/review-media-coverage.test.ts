import { describe, expect, it } from "vitest";
import { regionContainsFace, type PersonRegion } from "./review-media";
const region = (shape: PersonRegion['shape'],points: PersonRegion['points']): PersonRegion => ({shape,points,kind:"protected_unknown",face_id:"face",student_id:null});
describe("região da pessoa contém rosto vinculado", () => {
  const face = {x:20,y:20,w:60,h:60};
  it("aceita retângulo incluindo bordas e nega recorte errado", () => {
    expect(regionContainsFace(region("rect",[20,20,60,60]),face)).toBe(true);
    expect(regionContainsFace(region("rect",[0,0,10,10]),face)).toBe(false);
    expect(regionContainsFace(region("rect",[20,20,59,60]),face)).toBe(false);
  });
  it("aceita contorno completo, inclusive quando coincide com bbox", () => {
    expect(regionContainsFace(region("polygon",[[0,0],[100,0],[100,100],[0,100]]),face)).toBe(true);
    expect(regionContainsFace(region("polygon",[[20,20],[80,20],[80,80],[20,80]]),face)).toBe(true);
  });
  it("nega contorno côncavo que recorta dentro do bbox com todos cantos retidos", () => {
    const notch = [[0,0],[100,0],[100,100],[60,100],[60,50],[40,50],[40,100],[0,100]];
    expect(regionContainsFace(region("polygon",notch),face)).toBe(false);
  });
  it("nega rosto inválido e polígono que cruza bbox", () => {
    expect(regionContainsFace(region("rect",[0,0,100,100]),{...face,w:NaN})).toBe(false);
    expect(regionContainsFace(region("polygon",[[0,0],[100,0],[50,100]]),face)).toBe(false);
  });
});
