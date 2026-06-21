import 'dart:convert';
import 'dart:developer' as dev;

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'app_config.dart';
import 'native_bridge.dart';

class WebViewShell extends StatefulWidget {
  const WebViewShell({super.key});

  @override
  State<WebViewShell> createState() => _WebViewShellState();
}

class _WebViewShellState extends State<WebViewShell>
    with WidgetsBindingObserver {
  late final WebViewController _controller;
  late final NativeBridge _bridge;
  bool _isLoading = true;
  bool _hasError = false;
  String _errorMessage = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initController();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _controller.runJavaScript('if (window.onAppResume) window.onAppResume();');
    }
  }

  void _initController() {
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0E1A12))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            dev.log('[WebViewShell] pageStarted: $url');
            if (mounted) setState(() { _isLoading = true; _hasError = false; });
          },
          onPageFinished: (url) {
            dev.log('[WebViewShell] pageFinished: $url');
            if (mounted) setState(() => _isLoading = false);
          },
          onWebResourceError: (error) {
            final detail = {
              'errorType': error.errorType?.name,
              'description': error.description,
              'errorCode': error.errorCode,
              'url': error.url,
            };
            final jsonString = jsonEncode(detail);
            dev.log('[WebViewShell] webResourceError: $jsonString');
            _controller.runJavaScript(
              "window.dispatchEvent(new CustomEvent('shell:webview:error', { detail: $jsonString }))",
            );
            if (error.isForMainFrame ?? false) {
              if (mounted) {
                setState(() {
                  _isLoading = false;
                  _hasError = true;
                  _errorMessage = error.description;
                });
              }
            }
          },
        ),
      );

    _bridge = NativeBridge(
      controller: _controller,
      onPushReceived: (payload) {
        final jsonString = jsonEncode(payload);
        _controller.runJavaScript('if (window.onPush) window.onPush($jsonString);');
      },
    );

    _controller.addJavaScriptChannel(
      'NativeBridge',
      onMessageReceived: (message) => _bridge.handle(message.message),
    );

    // Android WebView: WebRTC(getUserMedia) 호출 시 카메라/마이크 자동 허용.
    // 시스템 권한은 permission_handler 가 미리 받아둔 상태여야 함.
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
      platform.setGeolocationEnabled(true);
      platform.setOnPlatformPermissionRequest((request) {
        request.grant();
      });
    }

    _loadApp();
  }

  Future<void> _loadApp() async {
    setState(() { _isLoading = true; _hasError = false; });

    // 후보 URL 들 중 첫 번째로 도달 가능한 호스트를 선택.
    // 환경에 따라(에뮬 vs 실기기 vs 시뮬) 어느 후보가 살아있는지 다르므로
    // 자동 폴백으로 사용자가 BASE_URL 을 매번 바꾸지 않도록 한다.
    final candidates = AppConfig.candidates;
    String? resolved;
    for (final base in candidates) {
      dev.log('[WebViewShell] probing $base');
      final ok = await _bridge.checkConnectivity('$base/api/live/health');
      if (ok) {
        resolved = base;
        break;
      }
    }

    if (resolved == null && mounted) {
      _showServerUnavailableDialog();
      return;
    }

    AppConfig.activeBaseUrl = resolved!;
    dev.log('[WebViewShell] resolved baseUrl=$resolved');
    _controller.loadRequest(Uri.parse('$resolved/app'));
  }

  void _showServerUnavailableDialog() {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF111916),
        title: const Text('서버에 연결할 수 없습니다', style: TextStyle(color: Colors.white)),
        content: const Text(
          '네트워크 상태를 확인하거나 잠시 후 다시 시도해 주세요.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _loadApp();
            },
            child: const Text('재시도', style: TextStyle(color: Color(0xFF22C55E))),
          ),
        ],
      ),
    );
  }

  Future<bool> _handleBackNavigation() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false; // 앱 종료 막음
    }
    return true; // 앱 종료 허용
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldPop = await _handleBackNavigation();
        if (shouldPop && context.mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0E1A12),
        body: SafeArea(
          child: Stack(
            children: [
              if (!_hasError)
                WebViewWidget(controller: _controller),
              if (_isLoading && !_hasError)
                const Center(
                  child: CircularProgressIndicator(color: Color(0xFF22C55E)),
                ),
              if (_hasError)
                _ErrorView(
                  message: _errorMessage,
                  onRetry: _loadApp,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, color: Colors.white38, size: 64),
            const SizedBox(height: 16),
            const Text(
              '페이지를 불러올 수 없습니다',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: const TextStyle(color: Colors.white54, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('다시 시도'),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF22C55E),
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
