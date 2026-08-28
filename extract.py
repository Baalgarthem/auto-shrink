import re
import os

with open('auto-shrink.user.js', 'r', encoding='utf-8') as f:
    content = f.read()

# I will write a simple node script because JS regex is easier for JS files
