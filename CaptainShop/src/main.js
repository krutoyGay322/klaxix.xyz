// App bootstrap. Runs after all other scripts have defined window.App.*
(function (App) {
  const store = App.store, game = App.game;
  const app = document.getElementById('app');

  const schedule = App.createRenderer(app, App.render);
  store.onChange(schedule);
  App.bindEvents(app);

  if (!store.load()) store.set({ shrine: game.genShrine() });
  App.morphInto(app, App.render()); // synchronous first paint (never wait on rAF)
  schedule();

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) { requestAnimationFrame(onResize); return; }
    // На телефоне вписывание по высоте оставляет крошечный кадр с полями по
    // бокам — вместо этого заполняем всю ширину, лишняя высота прокручивается.
    const mobile = Math.min(w, h) <= 620;
    const scale = Math.max(0.05, mobile ? w / 2560 : Math.min(w / 2560, h / 1440));
    if (scale !== store.state.scale || mobile !== store.state.mobile) store.setState({ scale, mobile });
  }
  window.addEventListener('resize', onResize);
  onResize();
  setTimeout(onResize, 200);
  setTimeout(onResize, 800);

  requestAnimationFrame(() => App.startEmbers(() => document.getElementById('bg')));
})(window.App);
