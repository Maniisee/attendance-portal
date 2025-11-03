from flask import Flask, request, send_file, jsonify
import qrcode
import io

app = Flask(__name__)

@app.route('/generate-qr', methods=['POST'])
def generate_qr():
    print("is_json:", request.is_json)
    print("json:", request.json)
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400
    data = request.json.get('data')
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    img = qrcode.make(data)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

if __name__ == '__main__':
    app.run(port=5050)