import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// 모바일/데스크탑 네이티브용 LiveViewWidget.
/// 라이브 영상은 WebView(HTML/JS)에 위임한다 — Flutter WebRTC 사용 금지.
class LiveViewWidget extends StatefulWidget {
  const LiveViewWidget({
    super.key,
    required this.url,
    this.onMessage,
  });

  final String url;
  final void Function(String message)? onMessage;

  @override
  State<LiveViewWidget> createState() => _LiveViewWidgetState();
}

class _LiveViewWidgetState extends State<LiveViewWidget> {
  late final WebViewController _ctrl;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _initController();
  }

  void _initController() {
    _ctrl = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF000000))
      ..setNavigationDelegate(
        NavigationDelegate(
          onWebResourceError: (err) {
            if (!mounted) return;
            setState(() => _hasError = true);
            widget.onMessage?.call('onLiveError');
          },
        ),
      )
      ..addJavaScriptChannel(
        'FlutterChannel',
        onMessageReceived: (msg) {
          widget.onMessage?.call(msg.message);
        },
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  void _retry() {
    setState(() => _hasError = false);
    _ctrl.loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    if (_hasError) {
      return _LiveErrorView(onRetry: _retry);
    }
    return WebViewWidget(controller: _ctrl);
  }
}

class _LiveErrorView extends StatelessWidget {
  const _LiveErrorView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.signal_wifi_off, color: Colors.white54, size: 48),
            const SizedBox(height: 16),
            const Text(
              '라이브 화면을 불러오지 못했어요',
              style: TextStyle(color: Colors.white, fontSize: 16),
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: onRetry,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: const BorderSide(color: Colors.white38),
              ),
              child: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }
}
