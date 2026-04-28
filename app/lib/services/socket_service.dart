import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../app_config.dart';
import '../models/message.dart';

class SocketService {
  static final SocketService _instance = SocketService._();
  factory SocketService() => _instance;
  SocketService._();

  late IO.Socket _socket;
  bool _connected = false;

  final _auctionUpdateCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _auctionEndedCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _chatCtrl = StreamController<ChatMessage>.broadcast();
  final _lobbyLiveNewCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _lobbyLiveEndedCtrl = StreamController<Map<String, dynamic>>.broadcast();
  final _viewerCountCtrl = StreamController<int>.broadcast();

  Stream<Map<String, dynamic>> get onAuctionUpdate => _auctionUpdateCtrl.stream;
  Stream<Map<String, dynamic>> get onAuctionEnded => _auctionEndedCtrl.stream;
  Stream<ChatMessage> get onChatMessage => _chatCtrl.stream;
  Stream<Map<String, dynamic>> get onLobbyLiveNew => _lobbyLiveNewCtrl.stream;
  Stream<Map<String, dynamic>> get onLobbyLiveEnded => _lobbyLiveEndedCtrl.stream;
  Stream<int> get onViewerCount => _viewerCountCtrl.stream;

  void connect() {
    if (_connected) return;
    _socket = IO.io(
      AppConfig.baseUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );
    _socket.connect();
    _connected = true;

    _socket.on('auction:update', (data) {
      _auctionUpdateCtrl.add(Map<String, dynamic>.from(data as Map));
    });
    _socket.on('auction:ended', (data) {
      _auctionEndedCtrl.add(Map<String, dynamic>.from(data as Map));
    });
    _socket.on('chat:message', (data) {
      _chatCtrl.add(ChatMessage.fromJson(Map<String, dynamic>.from(data as Map)));
    });
    _socket.on('lobby:live:new', (data) {
      _lobbyLiveNewCtrl.add(Map<String, dynamic>.from(data as Map));
    });
    _socket.on('lobby:live:ended', (data) {
      _lobbyLiveEndedCtrl.add(Map<String, dynamic>.from(data as Map));
    });
    _socket.on('viewer:count', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _viewerCountCtrl.add((map['count'] as num).toInt());
    });
  }

  void join(String liveId) {
    _socket.emit('join', {'liveId': liveId});
  }

  void bid(String liveId, String auctionId, int price, String userId, String? userName) {
    _socket.emit('bid', {
      'liveId': liveId,
      'auctionId': auctionId,
      'price': price,
      'userId': userId,
      if (userName != null) 'userName': userName,
    });
  }

  void sendChat(String liveId, String userId, String message, {String? userName}) {
    _socket.emit('chat', {
      'liveId': liveId,
      'userId': userId,
      'message': message,
      if (userName != null) 'userName': userName,
    });
  }

  void dispose() {
    _auctionUpdateCtrl.close();
    _auctionEndedCtrl.close();
    _chatCtrl.close();
    _lobbyLiveNewCtrl.close();
    _lobbyLiveEndedCtrl.close();
    _viewerCountCtrl.close();
    _socket.dispose();
    _connected = false;
  }
}
