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

  Stream<Map<String, dynamic>> get onAuctionUpdate => _auctionUpdateCtrl.stream;
  Stream<Map<String, dynamic>> get onAuctionEnded => _auctionEndedCtrl.stream;
  Stream<ChatMessage> get onChatMessage => _chatCtrl.stream;

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
  }

  void join(String roomId) {
    _socket.emit('join', {'roomId': roomId});
  }

  void bid(String roomId, int price, String userId) {
    _socket.emit('bid', {'roomId': roomId, 'price': price, 'userId': userId});
  }

  void sendChat(String roomId, String userId, String message) {
    _socket.emit('chat', {'roomId': roomId, 'userId': userId, 'message': message});
  }

  void dispose() {
    _auctionUpdateCtrl.close();
    _auctionEndedCtrl.close();
    _chatCtrl.close();
    _socket.dispose();
    _connected = false;
  }
}
