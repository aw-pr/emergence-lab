/**
 * Per-sim narrative shown beside the title in the sim header: where the model
 * came from and what its equations actually say. Keyed by slug, with
 * "<slug>/<variant>" overrides for entries whose variants are distinct models
 * in their own right (the strange attractors).
 *
 * Prose, not markup: the header renders these as plain paragraphs. Keep each
 * field to a couple of sentences so the header stays a header.
 */
export interface SimAbout {
  /** Who built it, when, and why it mattered. */
  history: string;
  /** What the equations on screen are doing, in words. */
  maths: string;
  /**
   * What a click-and-drag on the canvas does to this particular sim, in its own
   * terms. Only for kernels that implement applyImpulse; the header renders it
   * solely when the pointer handler is actually attached, so an entry here
   * cannot promise interactivity the sim does not have.
   */
  interaction?: string;
}

const ABOUT: Readonly<Record<string, SimAbout>> = {
  "gray-scott": {
    history:
      "Alan Turing argued in 1952 that two chemicals diffusing at different rates could break their own symmetry and paint an embryo's stripes and spots, which was a startling claim: structure with no blueprint. Peter Gray and Stephen Scott studied such an autocatalytic reaction in the early 1980s, and John Pearson's 1993 map of its parameter space showed a single pair of equations producing spots, stripes, worms and self-replicating blobs depending only on two dials.",
    maths:
      "U is fed in and consumed, V is autocatalytic: the UV² term means V makes more of itself wherever it already is. F sets the feed rate, k the kill rate, and D_u > D_v means the inhibitor spreads faster than the activator. That imbalance is the whole trick, and it is what Turing predicted.",
    interaction:
      "Click and drag on the canvas to paint V into the medium and deplete U beneath it, which is exactly how the sim seeds itself. Each stroke is a new origin: it will grow into whatever the current F and k dictate, so the same gesture makes spots in one regime and worms in another.",
  },
  "abelian-sandpile": {
    history:
      "Per Bak, Chao Tang and Kurt Wiesenfeld introduced it in 1987 as the founding model of self-organised criticality: a system that tunes itself to the knife edge where avalanches follow a power law, with no parameter set by hand. Deepak Dhar proved in 1990 that the final configuration does not depend on the order you drop the grains, which is the abelian property the model is named for.",
    maths:
      "Every site holds a grain count. Reach four and the site topples, giving one grain to each of its four neighbours, which can tip them over in turn. The rule is trivial and local; the fractal terraces and scale-free avalanches are entirely emergent.",
    interaction:
      "Click and drag to pour grains onto the pile. Drop them on a site already near the threshold and the avalanche can run far beyond the patch you touched, which is the power-law tail Bak's argument is about. The abelian property means the terraces settle the same way regardless of where or in what order you poured.",
  },
  "ising-model": {
    history:
      "Wilhelm Lenz posed it in 1920 and gave it to his student Ernst Ising, who solved the one-dimensional case in 1924 and found no phase transition, concluding the model was a failure. Lars Onsager's exact two-dimensional solution in 1944 proved him wrong and became one of the landmarks of statistical physics: it is the simplest model that undergoes a genuine phase transition.",
    maths:
      "Each spin is +1 or -1. The energy H rewards neighbouring spins for agreeing (coupling J) and for following any external field h. Sampling at temperature T, order wins below the critical point and noise wins above it, and exactly at it correlations become scale-free.",
    interaction:
      "Click and drag to force every spin under the pointer to +1, making an aligned domain by hand. What happens next reads the temperature for you: below the critical point the domain holds and grows, above it thermal noise eats it within moments, and near the transition it lingers and frays.",
  },
  "kuramoto-oscillators": {
    history:
      "Yoshiki Kuramoto published it in 1975, building on Arthur Winfree's 1967 insight that biological rhythms synchronise. It explains fireflies flashing together, pacemaker cells in the heart, and the Millennium Bridge wobble of 2000, and it is remarkable for being solvable: Kuramoto found the exact threshold at which coupling defeats disorder.",
    maths:
      "Each oscillator runs at its own natural frequency ωᵢ and is pulled towards its neighbours' phases by the coupling K. Below a critical K the phases drift apart, above it a fraction locks together and moves as one. The transition is sharp, not gradual.",
    interaction:
      "Click and drag to drag the oscillators under the pointer towards a common phase, synchronising a patch by force. Whether it survives is the coupling's answer, not yours: above the critical K the patch spreads into its neighbours, below it the spread of natural frequencies pulls it apart again.",
  },
  "game-of-life": {
    history:
      "John Conway devised it in 1970, tuning the rules by hand until the population neither exploded nor died out, and Martin Gardner's Scientific American column that October made it a phenomenon. It is Turing complete: with gliders and glider guns you can build a computer inside it, which means no shortcut can predict its future in general. You have to run it.",
    maths:
      "One rule, counting the eight neighbours: a dead cell with exactly three live neighbours is born, a live cell with two or three survives, everything else dies. Nothing in that rule mentions gliders, oscillators or guns; all of them fall out of it.",
    interaction:
      "Click and drag to bring cells to life under the pointer. A solid blob is far too crowded to survive, so it collapses from the inside and burns outward, and the debris throws gliders. Draw a long stroke and the same thing happens along its whole edge.",
  },
  "belousov-zhabotinsky": {
    history:
      "Boris Belousov found a chemical reaction that oscillated in colour around 1951, and journals rejected it twice as impossible: chemistry was supposed to run downhill to equilibrium, not tick like a clock. Anatol Zhabotinsky revived the work in the early 1960s, and the reaction became the classic demonstration that a system held far from equilibrium can organise itself in both time and space.",
    maths:
      "Three species chase each other in a loop, each catalysing the next and consuming the one before, while diffusion couples neighbouring patches. The local cycle sets the tempo and diffusion turns it into travelling fronts, so pacemaker points wind up into spiral waves. This is a simplified three-species approximation, not the full Oregonator.",
    interaction:
      "Click and drag to inject reagent and start a new pacemaker, which sends a circular front out across the medium. Cut across an existing front and the broken end curls around itself: a free wave tip is what a spiral is made of, and this is how you make one on purpose.",
  },
  physarum: {
    history:
      "Physarum polycephalum is a single-celled slime mould with no brain. Toshiyuki Nakagaki showed in 2000 that it solves mazes, and Atsushi Tero's team in 2010 let it grow over a map of Tokyo and watched it reproduce the rail network's topology. Jeff Jones' 2010 agent model, which this follows, gets the same transport networks from particles that only sense and steer.",
    maths:
      "Each agent deposits a chemical trail, samples it at three points ahead, and turns towards the strongest. The trail diffuses and decays. Reinforcement plus decay means useful paths thicken and unused ones fade, and the network optimises with no agent knowing anything about the network.",
    interaction:
      "Click and drag to lay chemical trail directly onto the field. You are not steering the agents, you are baiting them: they sense the trail you left and turn up its gradient, and if enough of them follow it the path reinforces itself into a real vein of the network. Stop feeding it and decay takes it back.",
  },
  boids: {
    history:
      "Craig Reynolds published Boids at SIGGRAPH in 1987, and it changed how animation handles crowds: the bats in Batman Returns (1992) were boids. The argument it settled is that a flock needs no leader and no choreography. Three local rules, each bird watching only its neighbours, produce the whole thing.",
    maths:
      "Every step, each agent adds three steering urges to its velocity: separation away from crowding neighbours, alignment towards their average heading, cohesion towards their average position. The weights w_s, w_a and w_c set the character of the flock, and the perception radius decides who counts as a neighbour.",
    interaction:
      "Click and drag through the flock and the birds under the pointer swoop away from it, exactly as a real flock parts around a hawk. Only the ones you touch feel it, yet the wake travels much further, because alignment and cohesion carry the disturbance outward through birds that never saw the pointer at all.",
  },
  "particle-life": {
    history:
      "Jeffrey Ventrella's Clusters explored the idea in the 2000s, and it spread widely around 2018 under the name Particle Life. It is a deliberately minimal question: how much of life-like behaviour, cells, membranes, hunting, reproduction-like division, comes free from particles that merely attract and repel each other by type?",
    maths:
      "An asymmetric matrix says how strongly type i is pulled towards type j, and asymmetry is essential: if red chases green while green flees red, you get pursuit rather than settling. Forces are short-range with a repulsive core, motion is heavily damped, so structures persist instead of flying apart.",
  },
  "lorenz-attractor": {
    history:
      "Edward Lorenz reduced atmospheric convection to three equations in 1963 and discovered that rounding an input from 0.506127 to 0.506 gave a completely different forecast. That is the butterfly effect, and it killed the dream of long-range weather prediction. The shape he plotted was the first strange attractor: bounded, deterministic, and never repeating.",
    maths:
      "Three coupled ordinary differential equations, no randomness anywhere. Trajectories are trapped in a finite region yet never close into a loop and never cross, so nearby starts diverge exponentially while both stay on the same fractal surface.",
  },
  "lorenz-attractor/lorenz": {
    history:
      "Edward Lorenz reduced atmospheric convection to three equations in 1963 and found that a rounding error in the fourth decimal place rewrote the forecast. That is the butterfly effect, and this two-lobed shape, plotted from a truncated weather model, was the first strange attractor anyone had seen.",
    maths:
      "σ is the Prandtl number, ρ the Rayleigh number driving the convection, β the geometry of the roll. The orbit circles one lobe an unpredictable number of times, then switches, forever, without ever repeating or self-intersecting.",
  },
  "lorenz-attractor/rossler": {
    history:
      "Otto Rössler built it in 1976 not from physics but as an exercise: the simplest possible continuous chaotic system, designed to be easier to analyse than Lorenz's. It has one lobe instead of two and exactly one nonlinear term, and it made the stretch-and-fold mechanism behind chaos visible.",
    maths:
      "Only the zx term is nonlinear. The orbit spirals slowly outward in the x-y plane, and when x grows large enough the z equation fires, kicking the trajectory up and folding it back to the centre. Stretch, then fold: that is chaos in its minimal form.",
  },
  "lorenz-attractor/thomas": {
    history:
      "The Belgian biologist René Thomas proposed it in 1999 while studying feedback circuits in gene regulation. It is cyclically symmetric, meaning x, y and z enter identically, so unlike Lorenz its shape encodes no preferred direction. It behaves like a particle wandering a three-dimensional lattice of forces.",
    maths:
      "Each derivative is a sine of the next variable minus a damping term b. With b small the motion is chaotic and labyrinthine; raise b and the flow dissipates into a simple cycle. One dial moves it across the whole route to chaos.",
  },
  "lorenz-attractor/aizawa": {
    history:
      "Named for Yoji Aizawa's work on chaotic dynamics in the 1980s, this system is studied less for what it models than for what it looks like: a rotating spindle with orbits that thread through its poles. It shows how much geometric structure six parameters can buy.",
    maths:
      "Six constants govern a flow that combines rotation about the z-axis with a radial term pushing orbits onto a spheroid. Trajectories wrap the surface, punch through the axis, and re-emerge, which is why the shape reads as onion-like rather than butterfly-like.",
  },
  "lorenz-attractor/halvorsen": {
    history:
      "Attributed to Arne Dehli Halvorsen, this is another cyclically symmetric system, and it is the standard companion piece to Thomas: same symmetry, quadratic instead of sinusoidal, and a completely different attractor. Together they show that symmetry alone does not determine the shape.",
    maths:
      "Each equation damps its own variable, then subtracts four times the next and the square of the one after. The three-fold symmetry of the rule shows directly in the three-armed bloom, and each arm is the same dynamics viewed from a rotated frame.",
  },
  "diffusion-limited-aggregation": {
    history:
      "Thomas Witten and Leonard Sander introduced it in 1981, and it turned out to describe an unreasonable number of real things: electrodeposition, mineral dendrites in rock, lightning, coral, bacterial colonies. Its fractal dimension of about 1.71 in the plane is measured in the laboratory as well as on screen.",
    maths:
      "A walker diffuses at random until it touches the cluster, then freezes there. No optimisation and no plan; branching is a screening effect, because a walker is far more likely to meet an exposed tip than to survive the journey into a fjord.",
  },
  "elementary-cellular-automata": {
    history:
      "Stephen Wolfram catalogued all 256 one-dimensional two-state rules in 1983 and found the whole spectrum of behaviour hiding in the smallest possible rule space: uniform, periodic, chaotic, and Rule 110's mix of the two. Matthew Cook later proved Rule 110 Turing complete, so universal computation lives in a rule you can write on a napkin.",
    maths:
      "A cell's next state depends on three cells: itself and its two neighbours. Eight possible neighbourhoods, one output bit each, so 2⁸ = 256 rules, and the rule number is just those eight bits read as binary. Each new row is drawn below the last, so the image is the system's history.",
  },
  "brians-brain": {
    history:
      "Brian Silverman devised it in the 1980s while exploring cellular automata at MIT's Logo group. Adding a single refractory state to Life's on and off changes the character completely: nothing sits still, and the space fills with travelling wavefronts, which is why it is often read as a caricature of neural tissue.",
    maths:
      "Three states in a strict cycle: off becomes on only with exactly two live neighbours, on always becomes dying, dying always becomes off. The forced dying step is what forbids stable structures, so every pattern is a wave and waves annihilate on collision.",
  },
  mandelbrot: {
    history:
      "Gaston Julia and Pierre Fatou worked out the underlying theory around 1918 with no way to see it. Benoit Mandelbrot plotted it at IBM in 1980 on a printer, and the shape that came out, infinitely detailed and self-similar at every zoom, gave fractal geometry its emblem. Adrien Douady and John Hubbard later proved the set is connected and named it after him.",
    maths:
      "For each point c in the plane, iterate z → z² + c from z = 0 and ask whether it stays bounded. Points that never escape are the black set; colours record how many steps escaping points survived. The boundary has fractal dimension 2, so it is as complicated as a shape in the plane can be.",
  },
  "julia-set": {
    history:
      "Gaston Julia's 1918 memoir won a prize from the French Academy of Sciences and was then largely forgotten for sixty years for want of a machine to draw it. Every Julia set is a snapshot of one point of the Mandelbrot set, which is the deep relationship: c inside Mandelbrot gives a connected Julia set, c outside gives fractal dust.",
    maths:
      "Same iteration as Mandelbrot, z → z² + c, but the roles swap: c is fixed and every pixel is a starting z. The picture divides the plane into the prisoner set that stays bounded and the escapees, and the fractal boundary between them is the Julia set proper.",
  },
  "burning-ship": {
    history:
      "Michael Michelitsch and Otto Rössler described it in 1992. The change from the Mandelbrot iteration is one line, taking absolute values before squaring, and the reward is disproportionate: the map loses its smoothness, and in place of Mandelbrot's soft cardioid you get a jagged hull that genuinely resembles a ship on fire.",
    maths:
      "Iterate z → (|Re z| + i|Im z|)² + c. The absolute values are not analytic, which breaks the complex-differentiability that keeps the Mandelbrot boundary self-similar, and that fracture is exactly what produces the sharp masts and antennae.",
  },
  "logistic-mandelbrot": {
    history:
      "Robert May's 1976 Nature review made the logistic map x → rx(1 − x) the emblem of chaos from simplicity, and Mitchell Feigenbaum found universal constants in its period-doubling cascade. The map is secretly the same iteration as the Mandelbrot set: a linear change of variable turns one into the other, so the bifurcation diagram every textbook prints is the real slice of the set, a connection this view makes literal by standing the diagram on the plane it came from.",
    maths:
      "For each c, iterate z → z² + c past its transient and plot the next K values of Re(z) as height over the plane. The substitution z = r/2 − rx carries the logistic map onto this iteration with c = (r/2)(1 − r/2), so the sheet hanging over the real axis is exactly the bifurcation diagram, and every hyperbolic bulb of the Mandelbrot ground plane holds its attracting period-q cycle up as a stack of q sheets.",
  },
  "cyclic-ca": {
    history:
      "David Griffeath and colleagues studied it in the late 1980s, naming the phases it passes through: droplets, then defects, then demons, then spirals. It is the cleanest demonstration that cyclic dominance, the rock-paper-scissors relation found in real ecologies and in some bacterial strains, is enough to organise a whole field from noise.",
    maths:
      "Each cell holds a state in a cycle of n. A cell advances to state k+1 only when enough neighbours already hold k+1, so every state is eaten by its successor and nothing is ever stable. Random noise self-organises into rotating spirals whose cores are topological defects that cannot be removed locally.",
  },
  lenia: {
    history:
      "Bert Wang-Chak Chan published Lenia in 2019 after making Life continuous in space, time and state. The payoff was not a smoother Life but a zoo of hundreds of self-organising creatures, many of them with a smooth, unmistakably biological glide, discovered by search rather than designed.",
    maths:
      "Convolve the field with a ring-shaped kernel, then feed the result into a Gaussian growth function centred at μ with width σ: near-perfect neighbourhood density grows, too much or too little shrinks. Because the update is continuous, the same rule supports creatures at any scale.",
    interaction:
      "Click and drag to add mass to the field. Most blobs you draw are simply the wrong density and dissolve, since the growth function only rewards a neighbourhood close to μ. Some condense into a creature and glide away, which is roughly how Lenia's zoo was found: not designed, but stumbled on.",
  },
};

export function aboutFor(slug: string, variant?: string): SimAbout | undefined {
  return (variant ? ABOUT[`${slug}/${variant}`] : undefined) ?? ABOUT[slug];
}
