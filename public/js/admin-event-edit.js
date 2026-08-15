document.addEventListener('click', function (e) {
  var btn = e.target.closest('[data-copy-target]');
  if (!btn) return;
  var input = document.getElementById(btn.getAttribute('data-copy-target'));
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(function () {
    var original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(function () {
      btn.textContent = original;
    }, 1500);
  });
});
