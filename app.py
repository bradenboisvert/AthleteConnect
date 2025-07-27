from flask import Flask, render_template_string, request, redirect, url_for
from flask import session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'change-this-secret-key'

USERS = {
    'alice': {'password': generate_password_hash('password1'), 'role': 'player'},
    'bob': {'password': generate_password_hash('password2'), 'role': 'coach'},
}

HOME_HTML = """
<!doctype html>
<title>AthleteConnect</title>
<h1>Login</h1>
<form method=post action='{{ url_for("login") }}'>
  <input type=text name=username placeholder='Username' required>
  <input type=password name=password placeholder='Password' required>
  <input type=submit value=Login>
</form>
{% if error %}<p style='color:red;'>{{ error }}</p>{% endif %}
"""

PLAYER_HTML = """
<!doctype html>
<title>Player Dashboard</title>
<h1>Welcome, {{ user }}</h1>
<p>This is the player dashboard with learning resources.</p>
<a href='{{ url_for("logout") }}'>Logout</a>
"""

COACH_HTML = """
<!doctype html>
<title>Coach Dashboard</title>
<h1>Welcome Coach {{ user }}</h1>
<p>Here you can manage your players.</p>
<ul>
  {% for name, info in USERS.items() %}
    {% if info.role == 'player' %}
      <li>{{ name }}</li>
    {% endif %}
  {% endfor %}
</ul>
<a href='{{ url_for("logout") }}'>Logout</a>
"""

@app.route('/', methods=['GET'])
def index():
    if 'user' in session:
        return redirect(url_for('dashboard'))
    return render_template_string(HOME_HTML)

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    password = request.form['password']
    user = USERS.get(username)
    if user and check_password_hash(user['password'], password):
        session['user'] = username
        return redirect(url_for('dashboard'))
    return render_template_string(HOME_HTML, error='Invalid credentials')

@app.route('/dashboard')
def dashboard():
    username = session.get('user')
    if not username:
        return redirect(url_for('index'))
    user = USERS[username]
    if user['role'] == 'coach':
        return render_template_string(COACH_HTML, user=username, USERS=USERS)
    else:
        return render_template_string(PLAYER_HTML, user=username)

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
