from django.urls import path
from django.views.generic import TemplateView
from routing import views

urlpatterns = [
    path("api/health/", views.health),
    path("api/places/", views.places),
    path("api/plan/", views.plan),
    path("api/corridor/", views.corridor),
    path("", TemplateView.as_view(template_name="index.html")),
]
