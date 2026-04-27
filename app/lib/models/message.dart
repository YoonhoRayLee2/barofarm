class ChatMessage {
  final String userId;
  final String message;
  final int ts;

  const ChatMessage({
    required this.userId,
    required this.message,
    required this.ts,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        userId: j['userId'].toString(),
        message: j['message'] as String,
        ts: (j['ts'] as num).toInt(),
      );
}
