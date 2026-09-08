# Kills ONLY Playwright's own browser processes.
#
# WHY THIS FILE EXISTS. The supervisors used to clean up after a timed-out pass
# with `taskkill /F /IM chrome.exe`, which does two wrong things at once:
#
#   1. It kills Calvin's Chrome. Every open tab, every logged-in session, and
#      the Claude-in-Chrome extension with them. That ran 29 times on
#      2026-09-06 before anyone noticed the browser kept disappearing.
#   2. It does not kill Playwright. Headless Playwright runs
#      `chrome-headless-shell.exe` out of %LOCALAPPDATA%\ms-playwright, not
#      `chrome.exe`, so the orphan cleanup it was written for never once fired.
#
# Filtering on the executable PATH rather than the image name is what makes
# this safe: every Playwright browser lives under ms-playwright and no
# user-installed Chrome does. Headed runs (`--headed`) launch a real
# `chrome.exe` from that same directory, so they are covered too.
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -like '*ms-playwright*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
