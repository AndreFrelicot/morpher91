struct VsOut {
  @builtin(position) position : vec4f,
};

@vertex
fn vs(@location(0) position : vec2f) -> VsOut {
  var out : VsOut;
  out.position = vec4f(position, 0.0, 1.0);
  return out;
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(1.0, 0.0, 0.0, 1.0);
}
