# Analytic sheet-edge curves

## Finding

The mathematical boundary and the renderer's detected-period boundary are not
currently the same object. A genuine period-q sheet occupies a hyperbolic
component on which an exact q-cycle is attracting. Its edge is the component's
bifurcation curve. The finite sampler can, however, label slowly converging
points with a doubled period after 1,500 warmup iterations. The harness exposes
large period-2 contours outside the true period-2 component, especially in the
close window. Treating every current categorical edge as a bifurcation locus
would therefore trim the wrong domain.

This stage delivers a pure curve tracer, tests it against known period-1,
period-2 and period-3 points, and measures the existing silhouette against the
primary period-1 and period-2 curves. Renderer integration stops before
tessellation because it first needs a component catalogue and an analytic
inside-component classification. No cloud or renderer code changed.

## Boundary equations

For the quadratic map

\[
f_c(z)=z^2+c,
\]

let \(z_{j+1}=f_c(z_j)\). A boundary point of a period-q hyperbolic
component satisfies

\[
f_c^q(z_0)-z_0=0,
\qquad
\mu_q(c,z_0)=\prod_{j=0}^{q-1}2z_j=e^{i\theta}.
\]

The first equation closes the cycle and the second puts its multiplier on the
unit circle. Exact period also requires \(f_c^d(z_0)\ne z_0\) for every proper
divisor \(d\) of \(q\). The tracer follows the branch selected by its seed, so
component discovery and rejection of lower-period branches remain the caller's
responsibility.

The renderer emits detected periods 1 through 8. Their true sheet edges have
the following interpretation:

- Period 1 is the boundary of the main cardioid. With
  \(\lambda=e^{i\theta}\), \(z=\lambda/2\) and
  \(c=\lambda/2-\lambda^2/4\). Its real extrema are \(c=1/4\) and
  \(c=-3/4\).
- Period 2 is the boundary of the single primary period-2 component. The cycle
  obeys \(z^2+z+c+1=0\), its multiplier is \(4(c+1)\), and therefore
  \(c=-1+\lambda/4\). It is the circle centred at -1 with radius 1/4.
- Periods 3 through 8 comprise one or more components in the rendered window.
  Each connected edge obeys the two equations above, but there is no comparable
  single closed form that identifies every component. Each component needs one
  exact-period seed and numerical continuation.

Hyperbolic components of different periods may touch at parabolic attachment
points, but do not share a boundary arc. A long sampled period-q to period-r
edge is consequently evidence of finite classification behaviour, not a new
analytic bifurcation curve between the components.

## Tracer

`src/app/orbitSurfaceCurves.ts` is renderer-independent and has no WebGL types.
Its numerical path uses multiplier angle as the continuation parameter. It
predicts the next \((z,c)\) from the previous two corrected points, then applies
complex Newton correction to the cycle and multiplier equations. A corrected
midpoint measures parameter-plane chord error. The step halves when that error
exceeds the requested limit and grows when the curve is locally flat.

The Newton Jacobian is analytic. Along the orbit the implementation propagates
\(\partial f_c^q/\partial z\), \(\partial f_c^q/\partial c\), and both
derivatives of the multiplier. The default root tolerance is \(10^{-12}\).
The period-1 and period-2 primary helpers use their closed forms and the same
deterministic chord subdivision contract, avoiding the singular period-2 root
at multiplier 1.

Unit evidence covers:

- cardioid extrema \(1/4\) and \(-3/4\) to \(10^{-12}\);
- period-2 extrema \(-3/4\) and \(-5/4\) to \(10^{-12}\);
- the real period-3 root \(c=-7/4\), with cycle point
  \(z=-1.7469796037174672\), to \(10^{-11}\);
- byte-for-byte deterministic repeat output;
- a tighter chord tolerance producing more points and remaining below its
  stated error limit.

## Harness comparison

The harness traces the primary period-1 and period-2 curves with a
parameter-plane chord limit of 0.00075, maps them into each fixture grid, and
reports pixel error at 8 px per grid cell. Two consecutive complete harness
runs are byte-identical.

| Window | Sampled depth-5 reference max error | Current adaptive mesh max error | Traced polyline max chord error | Current refined leaves | Traced points, periods 1 and 2 |
|---|---:|---:|---:|---:|---:|
| full-default | 28.988799 px | 0.314712 px | 0.038020 px | 216 | 174 |
| period-2-bulb | 37.294057 px | 31.558516 px | 0.191928 px | 307 | 174 |

The traced polyline itself is below the 0.25 px target in both windows and uses
fewer points than the current adaptive leaf count. That proves the geometric
representation is sufficiently accurate and compact. It does not prove that
the current sheet can be trimmed directly to it. The close-window current mesh
error is 31.558516 px because many vertices labelled period 2 lie well outside
the exact period-2 circle. The depth-5 sampled reference is worse still because
it resolves more of those false categorical contours.

The existing stage-52 floors remain unchanged: maximum projected chord error is
0.482036 px and alternation 0.046875 in the full window, and 0.500000 px and
0.000000 in the period-2 close window. Refined leaves remain 216 and 307, both
within budget. Band density remains 4.333x and 5.000x.

## Integration stopping point

No tessellation, dissolve-distance or densification integration was attempted.
The next safe step is to supply exact-period component seeds for every visible
component through period 8, trace those curves, and classify the inside of each
closed curve analytically. Only then can `orbitSurface.ts` replace categorical
transition bisection with curve intersections and can `orbit3d.ts` derive
dissolve and cloud-band distance from the same curve set. Until that component
association exists, integrating only the primary period-1 and period-2 curves
would remove sampled sheets without a defined replacement for the other
visible components.
