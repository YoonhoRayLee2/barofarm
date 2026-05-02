import 'dart:convert';
import 'dart:developer' as dev;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:http/http.dart' as http;

typedef PushCallback = void Function(Map<String, dynamic> payload);

class NativeBridge {
  NativeBridge({
    required this.controller,
    required this.onPushReceived,
  }) {
    _initPushHandlers();
  }

  final WebViewController controller;
  final PushCallback onPushReceived;
  final _storage = const FlutterSecureStorage();

  // ── Push handlers ─────────────────────────────────────────────────────────

  void _initPushHandlers() {
    // 포그라운드 수신
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final payload = {
        'title': message.notification?.title,
        'body': message.notification?.body,
        'data': message.data,
      };
      onPushReceived(payload);
    });

    // 백그라운드 → 앱 열림
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      final payload = {
        'title': message.notification?.title,
        'body': message.notification?.body,
        'data': message.data,
        'openedFromBackground': true,
      };
      onPushReceived(payload);
    });
  }

  // ── Message dispatcher ────────────────────────────────────────────────────

  Future<void> handle(String rawMessage) async {
    dev.log('[NativeBridge] received: $rawMessage');
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(rawMessage) as Map<String, dynamic>;
    } catch (e) {
      dev.log('[NativeBridge] JSON parse error: $e');
      return;
    }

    final method = msg['method'] as String? ?? '';
    final callId = msg['callId'] as String? ?? '';
    final args = (msg['args'] as Map<String, dynamic>?) ?? {};

    try {
      final result = await _dispatch(method, args);
      await _resolve(callId, result);
    } catch (e) {
      await _reject(callId, e.toString());
    }
  }

  Future<Map<String, dynamic>> _dispatch(
    String method,
    Map<String, dynamic> args,
  ) async {
    switch (method) {
      case 'getFcmToken':
        return _getFcmToken();
      case 'requestCameraPermission':
        return _requestPermission(Permission.camera);
      case 'requestMicPermission':
        return _requestPermission(Permission.microphone);
      case 'setSecureItem':
        return _setSecureItem(
          args['key'] as String? ?? '',
          args['value'] as String? ?? '',
        );
      case 'getSecureItem':
        return _getSecureItem(args['key'] as String? ?? '');
      case 'openExternal':
        return _openExternal(args['url'] as String? ?? '');
      default:
        throw UnsupportedError('Unknown method: $method');
    }
  }

  // ── Method implementations ─────────────────────────────────────────────────

  Future<Map<String, dynamic>> _getFcmToken() async {
    if (kIsWeb) return {'ok': true, 'value': null};
    final token = await FirebaseMessaging.instance.getToken();
    return {'ok': true, 'value': token};
  }

  Future<Map<String, dynamic>> _requestPermission(Permission permission) async {
    final status = await permission.request();
    return {
      'ok': true,
      'granted': status.isGranted,
      'status': status.name,
    };
  }

  Future<Map<String, dynamic>> _setSecureItem(String key, String value) async {
    await _storage.write(key: key, value: value);
    return {'ok': true};
  }

  Future<Map<String, dynamic>> _getSecureItem(String key) async {
    final value = await _storage.read(key: key);
    return {'ok': true, 'value': value};
  }

  Future<Map<String, dynamic>> _openExternal(String url) async {
    if (url.isEmpty) throw ArgumentError('url must not be empty');
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      return {'ok': true};
    }
    // 폴백: WebView 내 로드
    await controller.loadRequest(uri);
    return {'ok': true, 'fallback': 'webview'};
  }

  // ── Response helpers ───────────────────────────────────────────────────────

  Future<void> _resolve(String callId, Map<String, dynamic> value) async {
    final json = jsonEncode(value);
    await controller.runJavaScript(
      "if(window.NativeBridge&&window.NativeBridge._resolve)"
      "window.NativeBridge._resolve('$callId', $json);",
    );
  }

  Future<void> _reject(String callId, String error) async {
    final json = jsonEncode({'ok': false, 'error': error});
    await controller.runJavaScript(
      "if(window.NativeBridge&&window.NativeBridge._reject)"
      "window.NativeBridge._reject('$callId', $json);",
    );
  }

  // ── Connectivity helper ────────────────────────────────────────────────────

  /// 서버 가용성 체크. true = 접근 가능, false = 실패.
  Future<bool> checkConnectivity(String url) async {
    try {
      final response = await http.get(Uri.parse(url))
          .timeout(const Duration(seconds: 5));
      return response.statusCode < 500;
    } catch (_) {
      return false;
    }
  }
}
