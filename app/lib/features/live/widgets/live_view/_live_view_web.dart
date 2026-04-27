import 'dart:async';
import 'dart:ui_web' as ui;
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

import 'package:flutter/material.dart';

/// Flutter Web용 LiveViewWidget.
/// HtmlElementView 위에 iframe을 띄워 라이브 HTML/JS를 그대로 사용한다.
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
  late final String _viewId;
  html.IFrameElement? _iframe;
  StreamSubscription<html.MessageEvent>? _messageSub;
  bool _hasError = false;

  @override
  void initState() {
    super.initState();
    _viewId =
        'live-iframe-${DateTime.now().microsecondsSinceEpoch}-${widget.url.hashCode}';
    ui.platformViewRegistry.registerViewFactory(_viewId, (int viewId) {
      final iframe = html.IFrameElement()
        ..src = widget.url
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allow = 'camera; microphone; autoplay; clipboard-write'
        ..allowFullscreen = true;
      iframe.onError.listen((_) {
        if (!mounted) return;
        setState(() => _hasError = true);
        widget.onMessage?.call('onLiveError');
      });
      _iframe = iframe;
      return iframe;
    });

    // 라이브 HTML이 window.parent.postMessage로 보내는 이벤트를 그대로 전달.
    _messageSub = html.window.onMessage.listen((event) {
      final data = event.data;
      if (data is String) {
        widget.onMessage?.call(data);
      } else if (data is Map && data['type'] is String) {
        widget.onMessage?.call(data['type'] as String);
      }
    });
  }

  void _retry() {
    setState(() => _hasError = false);
    final iframe = _iframe;
    if (iframe != null) {
      iframe.src = widget.url;
    }
  }

  @override
  void dispose() {
    _messageSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_hasError) {
      return _LiveErrorView(onRetry: _retry);
    }
    return HtmlElementView(viewType: _viewId);
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
