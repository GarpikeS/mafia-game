// Красная вспышка + тряска при убийстве
export function triggerKillEffect() {
  const flash = document.getElementById('red-flash');
  flash.classList.remove('active');
  void flash.offsetWidth; // reflow
  flash.classList.add('active');

  document.body.classList.add('screen-shake');
  setTimeout(() => {
    document.body.classList.remove('screen-shake');
  }, 500);

  setTimeout(() => {
    flash.classList.remove('active');
  }, 800);
}
