#!/usr/bin/env python3
"""WebPod launcher — auto-installs dependencies on first run."""

import subprocess
import sys
import webbrowser
import threading


def check_python_version():
    if sys.version_info < (3, 8):
        print(f"Error: Python 3.8+ required, found {sys.version}")
        sys.exit(1)


def setup_libgpod_paths():
    """Auto-configure paths to find libgpod in the extracted release."""
    import os

    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)

    lib_paths = []
    python_paths = []

    if sys.platform == 'win32':
        # Windows: mingw64/bin and mingw64/lib/python3.X/site-packages
        mingw_bin = os.path.join(parent_dir, 'mingw64', 'bin')
        if os.path.isdir(mingw_bin):
            lib_paths.append(mingw_bin)
        for pyver in ['3.12', '3.11', '3.10']:
            sp = os.path.join(parent_dir, 'mingw64', 'lib', f'python{pyver}', 'site-packages')
            if os.path.isdir(sp):
                python_paths.append(sp)
                break
    else:
        # macOS/Linux: usr/local/lib and usr/local/lib/pythonX.X/site-packages
        usr_lib = os.path.join(parent_dir, 'usr', 'local', 'lib')
        if os.path.isdir(usr_lib):
            lib_paths.append(usr_lib)
        for pyver in ['3.12', '3.11', '3.10']:
            sp = os.path.join(usr_lib, f'python{pyver}', 'site-packages')
            if os.path.isdir(sp):
                python_paths.append(sp)
                break

    # Set environment variables for native libraries
    if lib_paths:
        if sys.platform == 'darwin':
            existing = os.environ.get('DYLD_LIBRARY_PATH', '')
            os.environ['DYLD_LIBRARY_PATH'] = ':'.join(lib_paths + ([existing] if existing else []))
        elif sys.platform != 'win32':
            existing = os.environ.get('LD_LIBRARY_PATH', '')
            os.environ['LD_LIBRARY_PATH'] = ':'.join(lib_paths + ([existing] if existing else []))
        else:
            # Windows: add to PATH
            existing = os.environ.get('PATH', '')
            os.environ['PATH'] = ';'.join(lib_paths) + ';' + existing

    # Add Python site-packages to import path
    if python_paths:
        sys.path[0:0] = python_paths


def ensure_dependencies():
    """Check for required packages, install if missing."""
    missing = []
    try:
        import flask
    except ImportError:
        missing.append('flask')

    try:
        import flask_socketio
    except ImportError:
        missing.append('flask-socketio')

    try:
        import mutagen
    except ImportError:
        missing.append('mutagen')

    if missing:
        print(f"Installing missing dependencies: {', '.join(missing)}")
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install'] + missing,
                stdout=subprocess.DEVNULL
            )
            print("Dependencies installed successfully.")
        except subprocess.CalledProcessError:
            print("Error: Failed to install dependencies.")
            print(f"Try manually: {sys.executable} -m pip install {' '.join(missing)}")
            sys.exit(1)


def open_browser(port):
    """Open the browser after a short delay to let the server start."""
    import time
    time.sleep(1.5)
    webbrowser.open(f'http://localhost:{port}')


def main():
    check_python_version()
    setup_libgpod_paths()
    ensure_dependencies()

    # Add parent directory to path so webpod package can be imported
    import os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    port = 5000
    # Check for --port argument
    for i, arg in enumerate(sys.argv[1:], 1):
        if arg == '--port' and i < len(sys.argv):
            try:
                port = int(sys.argv[i + 1])
            except (ValueError, IndexError):
                pass

    print("=" * 50)
    print("  WebPod - iPod Web Manager")
    print("=" * 50)
    print(f"  Running at: http://localhost:{port}")
    print("  Press Ctrl+C to stop")
    print("=" * 50)
    print()

    # Open browser in background thread
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    from webpod.app import run
    run(port=port)


if __name__ == '__main__':
    main()
